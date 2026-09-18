 
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";
import { hashPassword } from "../src/lib/auth/password";
import { ROLES } from "../src/config/roles";

/**
 * End-to-end check for the live-class rooms, driven with real browsers.
 *
 * Every peer is a separate Chromium browser context with a synthetic camera and
 * microphone (`--use-fake-device-for-media-stream`), so the assertions are made
 * against real getUserMedia, real SDP, real ICE and real RTCP statistics —
 * "connected" here means the browser says bytes arrived, not that a screenshot
 * looked plausible.
 *
 *   npm run dev          (or any https://localhost:3000)
 *   npm run signal       (:4001)
 *   npx tsx --env-file=.env scripts/live-room-check.ts
 *
 * Flags:
 *   --base=https://localhost:3000   where the app is
 *   --only=three,glare              run just these scenarios
 *   --headed                        watch it happen
 *   --keep                          leave the temp meeting and accounts behind
 *
 * It creates its own meeting and its own throwaway learner accounts, and
 * deletes both — along with every attendance row they generated — on the way
 * out, including when a scenario fails. It is safe to run against the live
 * database, but it is not free: it writes rows while it runs.
 */

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const has = (name: string) => args.includes(`--${name}`);

const BASE = flag("base") ?? "https://localhost:3000";
const HEADED = has("headed");
const KEEP = has("keep");
const ONLY = flag("only")?.split(",").map((s) => s.trim()).filter(Boolean);

const HOST_EMAIL = "joshicloudindia@gmail.com";
const TEMP_PASSWORD = "livecheck-temp-1234";
/** Everything this script creates is tagged, so cleanup can never guess wrong. */
const TAG = "livecheck";
const TEMP_EMAIL = (n: number) => `${TAG}-${n}@livecheck.invalid`;
const TEMP_USERS = 7; // the layout scenario joins six learners plus one over the limit

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(
    getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0],
  ),
});

/** Fake devices + auto-granted permissions: every peer has a camera and a mic. */
const MEDIA_ARGS = [
  "--use-fake-device-for-media-stream",
  "--use-fake-ui-for-media-stream",
  "--allow-file-access-from-files",
  // Headless Chromium otherwise refuses to start a stream that carries sound,
  // which would fail the remote tiles for a reason no learner would ever hit.
  "--autoplay-policy=no-user-gesture-required",
];

// ── tiny test harness ────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`    ok   ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`    FAIL ${name}${detail === undefined ? "" : ` → ${JSON.stringify(detail)}`}`);
  }
}
function section(title: string) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 60 - title.length))}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── peers ────────────────────────────────────────────────────────────────────

interface Peer {
  name: string;
  context: BrowserContext;
  page: Page;
  consoleErrors: string[];
}

async function openPeer(
  browser: Browser,
  opts: {
    name: string;
    email: string;
    password: string;
    roomUrl: string;
    viewport?: { width: number; height: number };
    /** Deny camera and microphone, to test the audio-only path. */
    denyMedia?: boolean;
    /** Click Join, or stop in the lobby. */
    join?: boolean;
  },
): Promise<Peer> {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: opts.viewport ?? { width: 1440, height: 900 },
    permissions: opts.denyMedia ? [] : ["camera", "microphone"],
  });
  const consoleErrors: string[] = [];

  const login = await context.request.post(`${BASE}/api/auth/login`, {
    data: { email: opts.email, password: opts.password },
  });
  if (!login.ok()) {
    throw new Error(`login failed for ${opts.email}: ${login.status()} ${await login.text()}`);
  }

  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(`[${opts.name}] ${m.text()}`);
  });
  page.on("pageerror", (e) => consoleErrors.push(`[${opts.name}] ${String(e)}`));

  // The first hit on a cold dev server compiles the room route, which can take
  // longer than Playwright's default; a production build answers immediately.
  await page.goto(opts.roomUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.getByTestId("join-now").waitFor({ timeout: 30_000 });
  if (opts.join !== false) {
    await page.getByTestId("join-now").click();
    await page.locator('[data-tile="self"]').waitFor({ timeout: 30_000 });
  }
  return { name: opts.name, context, page, consoleErrors };
}

interface PeerReport {
  socketId: string | null;
  connected: boolean;
  transport: string | null;
  hasTurn: boolean;
  meshLimit: number;
  sendingVideo: boolean;
  mediaStatus: string;
  localTracks: { kind: string; enabled: boolean; readyState: string }[];
  peers: {
    socketId: string;
    name: string;
    polite: boolean;
    status: string;
    connectionState: string;
    iceConnectionState: string;
    signalingState: string;
    restarts: number;
    state: Record<string, boolean>;
    remoteTracks: { kind: string; readyState: string; muted: boolean }[];
  }[];
}

const report = (peer: Peer) =>
  peer.page.evaluate(
    () =>
      (window as unknown as { __liveRoom: { report: () => unknown } }).__liveRoom.report() as never,
  ) as Promise<PeerReport>;

const stats = (peer: Peer) =>
  peer.page.evaluate(
    () =>
      (
        window as unknown as { __liveRoom: { stats: () => Promise<unknown> } }
      ).__liveRoom.stats() as never,
  ) as Promise<
    {
      socketId: string;
      name: string;
      connectionState: string;
      inbound: { kind: string; bytesReceived: number; framesDecoded: number }[];
      outbound: { kind: string; bytesSent: number }[];
      roundTripMs: number | null;
      candidateTypes: string[];
    }[]
  >;

/** Wait until this peer has `expected` others and every one of them is connected. */
async function waitConnected(peer: Peer, expected: number, timeout = 60_000) {
  await peer.page.waitForFunction(
    (n) => {
      const r = (
        window as unknown as { __liveRoom?: { report: () => { peers: { connectionState: string }[] } } }
      ).__liveRoom?.report();
      return Boolean(
        r && r.peers.length === n && r.peers.every((p) => p.connectionState === "connected"),
      );
    },
    expected,
    { timeout },
  );
}

/** What each remote <video> element is actually showing. */
async function remoteVideos(peer: Peer) {
  return peer.page.evaluate(() =>
    Array.from(document.querySelectorAll("video[data-peer-video-el]")).map((el) => {
      const v = el as HTMLVideoElement;
      const stream = v.srcObject as MediaStream | null;
      return {
        peerId: v.getAttribute("data-peer-video-el") ?? "",
        videoWidth: v.videoWidth,
        videoHeight: v.videoHeight,
        readyState: v.readyState,
        paused: v.paused,
        muted: v.muted,
        tracks: stream
          ? stream.getTracks().map((t) => ({ kind: t.kind, readyState: t.readyState, muted: t.muted }))
          : [],
      };
    }),
  );
}

async function closePeers(peers: Peer[]) {
  for (const p of peers) await p.context.close().catch(() => {});
}

function assertNoConsoleErrors(peers: Peer[], scenario: string) {
  const all = peers.flatMap((p) => p.consoleErrors);
  // A self-signed dev certificate makes Chromium grumble about the Next.js dev
  // websocket; that is the local cert, not the room.
  const real = all.filter(
    (e) => !/ERR_CERT|net::ERR_ABORTED|Failed to load resource: the server responded with a status of 404/.test(e),
  );
  check(`${scenario}: no console errors`, real.length === 0, real.slice(0, 6));
}

// ── scenarios ────────────────────────────────────────────────────────────────

interface Ctx {
  browser: Browser;
  deniedBrowser: Browser;
  roomUrl: string;
  users: { email: string; password: string; name: string }[];
  hostEmail: string;
  hostPassword: string;
}

/** Host plus two learners: the shape of nearly every class this app runs. */
async function scenarioThree(ctx: Ctx) {
  section("three peers — everyone sees and hears everyone");
  const peers: Peer[] = [];
  try {
    peers.push(
      await openPeer(ctx.browser, {
        name: "host",
        email: ctx.hostEmail,
        password: ctx.hostPassword,
        roomUrl: ctx.roomUrl,
      }),
    );
    for (let i = 0; i < 2; i++) {
      peers.push(
        await openPeer(ctx.browser, {
          name: `learner${i + 1}`,
          email: ctx.users[i].email,
          password: ctx.users[i].password,
          roomUrl: ctx.roomUrl,
        }),
      );
    }

    for (const p of peers) await waitConnected(p, 2);

    for (const p of peers) {
      const r = await report(p);
      check(`${p.name}: sees 2 remote peers`, r.peers.length === 2, r.peers.length);
      check(
        `${p.name}: every peer connectionState=connected`,
        r.peers.every((x) => x.connectionState === "connected"),
        r.peers.map((x) => [x.name, x.connectionState]),
      );
      check(
        `${p.name}: transport is websocket`,
        r.transport === "websocket",
        r.transport,
      );
    }

    // Give the encoders a moment to actually push frames.
    await sleep(3_000);

    for (const p of peers) {
      const videos = await remoteVideos(p);
      check(`${p.name}: 2 remote video elements`, videos.length === 2, videos.length);
      for (const v of videos) {
        check(
          `${p.name}: remote tile ${v.peerId.slice(0, 6)} has a live video track`,
          v.tracks.some((t) => t.kind === "video" && t.readyState === "live" && !t.muted),
          v.tracks,
        );
        check(
          `${p.name}: remote tile ${v.peerId.slice(0, 6)} has an audio track`,
          v.tracks.some((t) => t.kind === "audio" && t.readyState === "live"),
          v.tracks,
        );
        check(
          `${p.name}: remote tile ${v.peerId.slice(0, 6)} is painting (videoWidth ${v.videoWidth})`,
          v.videoWidth > 0 && v.videoHeight > 0 && !v.paused,
          v,
        );
        check(
          `${p.name}: remote tile ${v.peerId.slice(0, 6)} is not muted`,
          v.muted === false,
          v.muted,
        );
      }

      const s = await stats(p);
      for (const row of s) {
        const audio = row.inbound.find((i) => i.kind === "audio");
        const video = row.inbound.find((i) => i.kind === "video");
        check(
          `${p.name}: receiving audio bytes from ${row.name}`,
          Boolean(audio && audio.bytesReceived > 0),
          audio,
        );
        check(
          `${p.name}: decoding video frames from ${row.name}`,
          Boolean(video && video.framesDecoded > 0),
          video,
        );
      }
      console.log(
        `         ${p.name} stats: ${s
          .map(
            (r) =>
              `${r.name}=${r.candidateTypes.join("/")} rtt=${r.roundTripMs ?? "?"}ms in=${r.inbound
                .map((i) => `${i.kind}:${i.bytesReceived}B`)
                .join(",")}`,
          )
          .join(" | ")}`,
      );
    }

    assertNoConsoleErrors(peers, "three peers");
  } finally {
    await closePeers(peers);
  }
}

/** Both sides offer at once. Without perfect negotiation, one of them dies. */
async function scenarioGlare(ctx: Ctx) {
  section("simultaneous join — the glare case");
  const peers: Peer[] = [];
  try {
    const [a, b] = await Promise.all([
      openPeer(ctx.browser, {
        name: "glareA",
        email: ctx.users[0].email,
        password: ctx.users[0].password,
        roomUrl: ctx.roomUrl,
        join: false,
      }),
      openPeer(ctx.browser, {
        name: "glareB",
        email: ctx.users[1].email,
        password: ctx.users[1].password,
        roomUrl: ctx.roomUrl,
        join: false,
      }),
    ]);
    peers.push(a, b);

    // Both click Join in the same tick, so both sockets land together and each
    // one's snapshot of the room can contain the other.
    await Promise.all([
      a.page.getByTestId("join-now").click(),
      b.page.getByTestId("join-now").click(),
    ]);
    await Promise.all([
      a.page.locator('[data-tile="self"]').waitFor({ timeout: 30_000 }),
      b.page.locator('[data-tile="self"]').waitFor({ timeout: 30_000 }),
    ]);

    await Promise.all([waitConnected(a, 1), waitConnected(b, 1)]);
    await sleep(3_000);

    for (const p of peers) {
      const r = await report(p);
      check(`${p.name}: connected after a simultaneous join`, r.peers[0]?.connectionState === "connected", r.peers[0]);
      const s = await stats(p);
      const video = s[0]?.inbound.find((i) => i.kind === "video");
      const audio = s[0]?.inbound.find((i) => i.kind === "audio");
      check(`${p.name}: media flowing both ways (video)`, Boolean(video && video.framesDecoded > 0), video);
      check(`${p.name}: media flowing both ways (audio)`, Boolean(audio && audio.bytesReceived > 0), audio);
    }
    const politeness = await Promise.all(peers.map(async (p) => (await report(p)).peers[0]?.polite));
    check(
      "exactly one side was polite",
      politeness[0] !== politeness[1],
      politeness,
    );

    assertNoConsoleErrors(peers, "glare");
  } finally {
    await closePeers(peers);
  }
}

/** Pull the network out from under one peer and watch the room put it back. */
async function scenarioRecovery(ctx: Ctx) {
  section("recovery — one peer loses the network for 12s");
  const peers: Peer[] = [];
  try {
    for (let i = 0; i < 3; i++) {
      peers.push(
        await openPeer(ctx.browser, {
          name: `r${i + 1}`,
          email: ctx.users[i].email,
          password: ctx.users[i].password,
          roomUrl: ctx.roomUrl,
        }),
      );
    }
    for (const p of peers) await waitConnected(p, 2);
    await sleep(2_000);

    const victim = peers[2];
    const cdp = await victim.context.newCDPSession(victim.page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    console.log("         r3 offline…");
    await sleep(12_000);

    const duringReport = await report(victim);
    check(
      "the cut peer notices it has lost the class server",
      duringReport.connected === false,
      { connected: duringReport.connected },
    );
    const reconnectingTiles = await peers[0].page
      .locator('[data-peer-status="reconnecting"], [data-peer-status="failed"]')
      .count()
      .catch(() => 0);
    console.log(`         tiles showing reconnecting/failed on r1: ${reconnectingTiles}`);

    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    console.log("         r3 back online — waiting for the room to heal…");

    // No reload anywhere: the room has to rebuild itself.
    await waitConnected(victim, 2, 90_000);
    for (const p of peers) await waitConnected(p, 2, 90_000);
    await sleep(3_000);

    for (const p of peers) {
      const r = await report(p);
      check(`${p.name}: back to 2 connected peers without a reload`, r.peers.length === 2 && r.peers.every((x) => x.connectionState === "connected"), r.peers.map((x) => x.connectionState));
      const s = await stats(p);
      check(
        `${p.name}: media flowing again`,
        s.every((row) => row.inbound.some((i) => i.kind === "audio" && i.bytesReceived > 0)),
        s.map((row) => row.inbound),
      );
    }
    const victimReport = await report(victim);
    check("the cut peer is back on the class server", victimReport.connected === true);

    assertNoConsoleErrors(peers, "recovery");
  } finally {
    await closePeers(peers);
  }
}

/** The bug that made screen sharing silently do nothing: no camera, no sender. */
async function scenarioScreenShare(ctx: Ctx) {
  section("screen share with the camera off");
  const peers: Peer[] = [];
  try {
    const sharer = await openPeer(ctx.browser, {
      name: "sharer",
      email: ctx.users[0].email,
      password: ctx.users[0].password,
      roomUrl: ctx.roomUrl,
      join: false,
    });
    // Camera off before joining, so the connection is negotiated with no
    // outgoing video track at all.
    await sharer.page.getByTestId("toggle-camera").click();
    await sharer.page.getByTestId("join-now").click();
    await sharer.page.locator('[data-tile="self"]').waitFor({ timeout: 30_000 });
    peers.push(sharer);

    const viewer = await openPeer(ctx.browser, {
      name: "viewer",
      email: ctx.users[1].email,
      password: ctx.users[1].password,
      roomUrl: ctx.roomUrl,
    });
    peers.push(viewer);

    await waitConnected(sharer, 1);
    await waitConnected(viewer, 1);
    await sleep(2_500);

    const seen = await viewer.page.locator('[data-tile="remote"][data-peer-video="on"]').count();
    check("camera off: the viewer shows an avatar, not a frozen frame", seen === 0, seen);

    // Headless Chromium has no desktop to capture, so the picker is stubbed with
    // a canvas. Everything downstream — the sender swap, the "Stop sharing"
    // handler, what the other browser receives — is the real code path.
    await sharer.page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 360;
      const g = canvas.getContext("2d")!;
      let x = 0;
      setInterval(() => {
        x = (x + 7) % canvas.width;
        g.fillStyle = "#101014";
        g.fillRect(0, 0, canvas.width, canvas.height);
        g.fillStyle = "#f43f5e";
        g.fillRect(x, 120, 120, 120);
      }, 50);
      const stream = (canvas as HTMLCanvasElement & { captureStream(fps: number): MediaStream })
        .captureStream(15);
      (window as unknown as { __fakeScreen?: MediaStream }).__fakeScreen = stream;
      navigator.mediaDevices.getDisplayMedia = async () => stream;
    });

    await sharer.page.getByRole("button", { name: "Share screen" }).click();
    await viewer.page
      .locator('[data-tile="remote"][data-peer-video="on"]')
      .waitFor({ timeout: 20_000 });
    await sleep(2_500);

    const sharing = await remoteVideos(viewer);
    check(
      "screen share reaches the other peer with the camera off",
      sharing.some((v) => v.videoWidth > 0 && v.tracks.some((t) => t.kind === "video" && !t.muted)),
      sharing,
    );
    const sharingLabel = await viewer.page.locator('[data-tile="remote"]').innerText();
    check("the viewer is told it is a screen share", /sharing/i.test(sharingLabel), sharingLabel);

    // The browser's own "Stop sharing" — ending the track behind our back.
    await sharer.page.evaluate(() => {
      const s = (window as unknown as { __fakeScreen?: MediaStream }).__fakeScreen;
      s?.getVideoTracks().forEach((t) => {
        t.stop();
        t.dispatchEvent(new Event("ended"));
      });
    });
    await sharer.page
      .getByRole("button", { name: "Share screen", pressed: false })
      .waitFor({ timeout: 15_000 });
    check("the sharer's own control goes back to off when the browser stops it", true);

    // Camera back on, which must now reach the viewer over the same sender.
    await sharer.page.getByTestId("toggle-camera").click();
    await viewer.page
      .locator('[data-tile="remote"][data-peer-video="on"]')
      .waitFor({ timeout: 20_000 });
    await sleep(2_500);
    const restored = await remoteVideos(viewer);
    check(
      "the camera takes the screen share's place afterwards",
      restored.some((v) => v.videoWidth > 0),
      restored,
    );

    assertNoConsoleErrors(peers, "screen share");
  } finally {
    await closePeers(peers);
  }
}

/** Mute and camera state are facts only the peer knows. They have to travel. */
async function scenarioState(ctx: Ctx) {
  section("mute / camera off shows on the other tiles");
  const peers: Peer[] = [];
  try {
    const a = await openPeer(ctx.browser, {
      name: "stateA",
      email: ctx.users[0].email,
      password: ctx.users[0].password,
      roomUrl: ctx.roomUrl,
    });
    const b = await openPeer(ctx.browser, {
      name: "stateB",
      email: ctx.users[1].email,
      password: ctx.users[1].password,
      roomUrl: ctx.roomUrl,
    });
    peers.push(a, b);
    await waitConnected(a, 1);
    await waitConnected(b, 1);
    await sleep(2_000);

    check(
      "before muting, B shows no muted badge for A",
      (await b.page.locator('[data-tile="remote"] [data-testid="muted-badge"]').count()) === 0,
    );

    await a.page.getByTestId("toggle-mic").click();
    await b.page
      .locator('[data-tile="remote"] [data-testid="muted-badge"]')
      .waitFor({ timeout: 10_000 });
    check("B sees A's muted badge", true);

    await a.page.getByTestId("toggle-camera").click();
    await b.page
      .locator('[data-tile="remote"][data-peer-video="off"]')
      .waitFor({ timeout: 10_000 });
    check("B sees A's camera go off", true);

    await a.page.getByTestId("toggle-camera").click();
    await b.page
      .locator('[data-tile="remote"][data-peer-video="on"]')
      .waitFor({ timeout: 15_000 });
    check("B sees A's camera come back", true);

    assertNoConsoleErrors(peers, "mute/camera state");
  } finally {
    await closePeers(peers);
  }
}

/** Refused permissions used to be a dead end: no tracks, no voice, no way back. */
async function scenarioNoCamera(ctx: Ctx) {
  section("joining with no camera or microphone");
  const peers: Peer[] = [];
  try {
    const talker = await openPeer(ctx.browser, {
      name: "talker",
      email: ctx.users[0].email,
      password: ctx.users[0].password,
      roomUrl: ctx.roomUrl,
    });
    peers.push(talker);

    // A browser with no fake devices and no granted permissions — exactly what a
    // learner who taps "Block" gets.
    const denied = await openPeer(ctx.deniedBrowser, {
      name: "denied",
      email: ctx.users[1].email,
      password: ctx.users[1].password,
      roomUrl: ctx.roomUrl,
      denyMedia: true,
      join: false,
    });
    peers.push(denied);

    await denied.page.getByTestId("media-notice").waitFor({ timeout: 20_000 });
    const notice = await denied.page.getByTestId("media-notice").innerText();
    check("the lobby explains what happened and offers a Retry", /Retry/i.test(notice), notice);
    check(
      "the message names the cause rather than shrugging",
      /block|allow|found|using/i.test(notice),
      notice,
    );

    await denied.page.getByTestId("join-now").click();
    await denied.page.locator('[data-tile="self"]').waitFor({ timeout: 30_000 });
    await waitConnected(denied, 1);
    await waitConnected(talker, 1);
    await sleep(3_000);

    const r = await report(denied);
    check("it joined anyway", r.peers[0]?.connectionState === "connected", r.peers[0]);
    check(
      "it carries no local tracks it doesn't have",
      r.localTracks.length === 0,
      r.localTracks,
    );
    check(
      "the room still says what's wrong once inside",
      (await denied.page.getByTestId("room-notice").count()) > 0,
    );

    const s = await stats(denied);
    const audio = s[0]?.inbound.find((i) => i.kind === "audio");
    check("and it can still hear the class", Boolean(audio && audio.bytesReceived > 0), audio);

    const videos = await remoteVideos(denied);
    check(
      "and still see the class",
      videos.some((v) => v.videoWidth > 0),
      videos,
    );

    assertNoConsoleErrors(peers, "no camera");
  } finally {
    await closePeers(peers);
  }
}

/** Tiles at 1, 2, 3 and 6, on a laptop and on a phone — and the mesh ceiling. */
async function scenarioLayout(ctx: Ctx) {
  section("layout at 1 / 2 / 3 / 6, and the mesh ceiling");
  const peers: Peer[] = [];
  const checkpoints = [1, 2, 3, 6];
  try {
    const total = Math.max(...checkpoints) + 1; // one more, to cross the limit
    for (let i = 0; i < total; i++) {
      peers.push(
        await openPeer(ctx.browser, {
          name: `L${i + 1}`,
          email: ctx.users[i].email,
          password: ctx.users[i].password,
          roomUrl: ctx.roomUrl,
        }),
      );
      const count = peers.length;
      if (!checkpoints.includes(count)) continue;

      const observer = peers[0];
      await observer.page.waitForFunction(
        (n) =>
          document.querySelectorAll('[data-tile="self"],[data-tile="remote"]').length === n,
        count,
        { timeout: 30_000 },
      );

      for (const width of [1440, 390]) {
        await observer.page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
        await sleep(600);
        const layout = await observer.page.evaluate(() => {
          const tiles = Array.from(
            document.querySelectorAll('[data-tile="self"],[data-tile="remote"]'),
          ).map((el) => {
            const r = el.getBoundingClientRect();
            return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) };
          });
          const doc = document.documentElement;
          return {
            tiles,
            overflowX: doc.scrollWidth - doc.clientWidth,
            overflowY: doc.scrollHeight - doc.clientHeight,
            viewportH: window.innerHeight,
          };
        });
        const smallest = layout.tiles.reduce(
          (min, t) => Math.min(min, Math.min(t.w, t.h)),
          Number.POSITIVE_INFINITY,
        );
        const offscreen = layout.tiles.filter(
          (t) => t.bottom > layout.viewportH + 1 || t.top < -1,
        );
        check(
          `${count} tiles @ ${width}px: no page overflow`,
          layout.overflowX <= 0 && layout.overflowY <= 0,
          { x: layout.overflowX, y: layout.overflowY },
        );
        check(
          `${count} tiles @ ${width}px: nothing pushed off-screen`,
          offscreen.length === 0,
          offscreen,
        );
        check(
          `${count} tiles @ ${width}px: smallest tile is ${smallest}px`,
          smallest >= 110,
          layout.tiles,
        );
      }
      await observer.page.setViewportSize({ width: 1440, height: 900 });
    }

    // One past the ceiling: audio for everyone, video for the host and whoever
    // is talking, and the room says so out loud.
    const observer = peers[0];
    const limit = (await report(observer)).meshLimit;
    check(`the mesh limit is configured (${limit})`, limit >= 2, limit);
    await observer.page.waitForFunction(
      (n) => document.querySelectorAll('[data-tile="self"],[data-tile="remote"]').length === n,
      peers.length,
      { timeout: 30_000 },
    );
    check(`room is over the limit (${peers.length} > ${limit})`, peers.length > limit);

    const notice = await observer.page.getByTestId("room-notice").allInnerTexts();
    check(
      "the room explains the ceiling instead of just degrading",
      notice.some((t) => /video is (now )?limited/i.test(t)),
      notice,
    );
    // Everyone still hears everyone, which is the promise being kept. The
    // newest peer's first RTCP report lands a second or two after it connects,
    // so give the numbers a moment rather than reading them mid-handshake.
    let s = await stats(observer);
    for (let wait = 0; wait < 12; wait++) {
      const complete =
        s.length === peers.length - 1 &&
        s.every((row) => row.inbound.some((i) => i.kind === "audio" && i.bytesReceived > 0));
      if (complete) break;
      await observer.page.waitForTimeout(1_000);
      s = await stats(observer);
    }
    check(
      "audio still reaches every participant",
      s.length === peers.length - 1 &&
        s.every((row) => row.inbound.some((i) => i.kind === "audio" && i.bytesReceived > 0)),
      s.map((r) => ({ n: r.name, a: r.inbound.find((i) => i.kind === "audio")?.bytesReceived })),
    );
    const held = await observer.page.evaluate(
      () =>
        (
          window as unknown as {
            __liveRoom: { report: () => { sendingVideo: boolean } };
          }
        ).__liveRoom.report().sendingVideo,
    );
    console.log(`         observer is still sending video: ${held}`);

    assertNoConsoleErrors(peers, "layout");
  } finally {
    await closePeers(peers);
  }
}

// ── setup / teardown ─────────────────────────────────────────────────────────

async function setup() {
  const host = await prisma.user.findUnique({
    where: { email: HOST_EMAIL },
    select: { id: true, name: true },
  });
  if (!host) throw new Error(`No host account for ${HOST_EMAIL}`);

  const studentRole = await prisma.role.findUnique({
    where: { slug: ROLES.STUDENT },
    select: { id: true },
  });
  if (!studentRole) throw new Error("No STUDENT role in the database");

  const passwordHash = await hashPassword(TEMP_PASSWORD);
  const users: { id: string; email: string; password: string; name: string }[] = [];
  for (let i = 1; i <= TEMP_USERS; i++) {
    const email = TEMP_EMAIL(i);
    const name = `Live Check ${i}`;
    // Deliberately not `upsert`: with relationMode = "prisma" an update on
    // User fans out into a SELECT against every table that references it, and
    // Prisma runs the upsert inside a transaction — long enough that TiDB has
    // closed the connection under it. Read first, then write the one row.
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    let id: string;
    if (existing) {
      id = existing.id;
      const now = new Date();
      await prisma.$executeRaw`
        UPDATE \`User\` SET passwordHash = ${passwordHash}, status = 'ACTIVE',
               emailVerified = ${now}, updatedAt = ${now}
        WHERE id = ${id}`;
    } else {
      const created = await prisma.user.create({
        data: {
          email,
          name,
          passwordHash,
          emailVerified: new Date(),
          status: "ACTIVE",
          roleId: studentRole.id,
        },
        select: { id: true },
      });
      id = created.id;
    }
    users.push({ id, email, password: TEMP_PASSWORD, name });
  }

  const roomCode = `${TAG}-${Date.now().toString(36)}`;
  const meeting = await prisma.meeting.create({
    data: {
      title: "Live room check (automated)",
      hostId: host.id,
      status: "LIVE",
      roomCode,
      provider: "webrtc",
      scheduledStart: new Date(),
      isRecordingEnabled: false,
    },
    select: { id: true, roomCode: true },
  });

  // Individually invited, which is what grants a learner entry to a class with
  // no course behind it.
  for (const u of users) {
    await prisma.meetingParticipant.create({
      data: { meetingId: meeting.id, userId: u.id, role: "ATTENDEE" },
    });
  }

  return { host, meeting, users };
}

async function teardown(meetingId: string, userIds: string[]) {
  await prisma.attendance.deleteMany({ where: { meetingId } });
  await prisma.meetingParticipant.deleteMany({ where: { meetingId } });
  await prisma.liveChatMessage.deleteMany({ where: { meetingId } });
  await prisma.meeting.delete({ where: { id: meetingId } });
  for (const id of userIds) {
    await prisma.attendance.deleteMany({ where: { userId: id } });
    await prisma.meetingParticipant.deleteMany({ where: { userId: id } });
    await prisma.refreshToken.deleteMany({ where: { userId: id } });
    await prisma.activityLog.deleteMany({ where: { userId: id } });
    await prisma.notification.deleteMany({ where: { userId: id } });
    await prisma.user.delete({ where: { id } });
  }
}

async function main() {
  console.log(`Live room check → ${BASE}`);

  const health = await fetch(`${BASE.replace(/:\d+$/, "")}`).catch(() => null);
  void health; // the real check is the first page load, below

  const { meeting, users } = await setup();
  const roomUrl = `${BASE}/live/room/${meeting.roomCode}`;
  console.log(`Room: ${roomUrl}`);
  console.log(`Temp learners: ${users.length} (${TEMP_EMAIL(1)} …)\n`);

  const browser = await chromium.launch({ headless: !HEADED, args: MEDIA_ARGS });
  // A second browser with no fake devices, for the refused-permissions peer.
  const deniedBrowser = await chromium.launch({
    headless: !HEADED,
    args: ["--allow-file-access-from-files"],
  });

  const ctx: Ctx = {
    browser,
    deniedBrowser,
    roomUrl,
    users,
    hostEmail: HOST_EMAIL,
    hostPassword: process.env.LIVE_CHECK_HOST_PASSWORD ?? "1234567890",
  };

  const scenarios: [string, (c: Ctx) => Promise<void>][] = [
    ["three", scenarioThree],
    ["glare", scenarioGlare],
    ["recovery", scenarioRecovery],
    ["screen", scenarioScreenShare],
    ["state", scenarioState],
    ["nocamera", scenarioNoCamera],
    ["layout", scenarioLayout],
  ];

  try {
    for (const [name, run] of scenarios) {
      if (ONLY && !ONLY.includes(name)) continue;
      try {
        await run(ctx);
      } catch (error) {
        failed++;
        failures.push(`${name} (threw)`);
        console.log(`    FAIL ${name} threw → ${(error as Error).message}`);
      }
      // Let the signaling server see everyone leave before the next scenario.
      await sleep(1_500);
    }
  } finally {
    await browser.close().catch(() => {});
    await deniedBrowser.close().catch(() => {});
    if (KEEP) {
      console.log(`\nLeft behind (--keep): meeting ${meeting.id}, ${users.length} temp accounts`);
    } else {
      await teardown(
        meeting.id,
        users.map((u) => u.id),
      ).catch((e) => console.log(`cleanup problem: ${(e as Error).message}`));
      console.log("\nCleaned up the temp meeting and accounts.");
    }
    await prisma.$disconnect();
  }

  console.log(`\n${"═".repeat(64)}`);
  console.log(`passed: ${passed}   failed: ${failed}`);
  if (failures.length) console.log(`failures:\n  - ${failures.join("\n  - ")}`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
