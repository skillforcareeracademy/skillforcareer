import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

/**
 * The academy's ad-platform connection settings.
 *
 * The client wanted to connect Facebook/Google from inside the panel ("ad me
 * kaise connect krein, edit ka option nhi aa rha") instead of sending us the
 * keys. Those keys live in a single `AdConfig` row; anything set there overrides
 * the matching env var, and a blank field falls back to env, so a deployment
 * already wired through the server config keeps working untouched.
 *
 * The secrets never leave the server: the admin screen is fed {@link adConfigStatus},
 * which says only whether each one is set — never the value itself.
 */

const SINGLETON = "default";

export interface MetaConfig {
  appId: string;
  appSecret: string;
  pageId: string;
  pageToken: string;
  verifyToken: string;
  graphVersion: string;
}

export interface GoogleConfig {
  leadsKey: string;
}

async function readRow() {
  try {
    return await prisma.adConfig.findUnique({ where: { id: SINGLETON } });
  } catch {
    // The table may not exist yet on a database migrated a step behind the
    // code; fall back to env rather than crash the webhooks or the Ads page.
    return null;
  }
}

/** The effective Meta config — DB first, env as fallback. */
export async function getMetaConfig(): Promise<MetaConfig> {
  const r = await readRow();
  return {
    appId: r?.metaAppId || "",
    appSecret: r?.metaAppSecret || env.META_APP_SECRET || "",
    pageId: r?.metaPageId || "",
    pageToken: r?.metaPageToken || env.META_PAGE_ACCESS_TOKEN || "",
    verifyToken: r?.metaVerifyToken || env.META_VERIFY_TOKEN || "",
    graphVersion: env.META_GRAPH_VERSION || "v21.0",
  };
}

/** The effective Google config — DB first, env as fallback. */
export async function getGoogleConfig(): Promise<GoogleConfig> {
  const r = await readRow();
  return { leadsKey: r?.googleLeadsKey || env.GOOGLE_LEADS_KEY || "" };
}

/** Meta capture is live once we can both verify the signature and read a lead. */
export function metaReady(c: MetaConfig): boolean {
  return Boolean(c.appSecret && c.pageToken);
}

/** Google capture is live once the shared key is set. */
export function googleReady(c: GoogleConfig): boolean {
  return Boolean(c.leadsKey);
}

/**
 * What the admin screen is allowed to see: the non-secret fields in full, and
 * for each secret only whether it is set and whether it is coming from env (so
 * the UI can say "set on the server" rather than offer to overwrite it blindly).
 */
export interface AdConfigStatus {
  meta: {
    appId: string;
    pageId: string;
    verifyToken: string;
    hasAppSecret: boolean;
    hasPageToken: boolean;
    connected: boolean;
    /** A field is still coming from env — there is no DB row, or it is blank. */
    fromEnv: boolean;
  };
  google: {
    hasKey: boolean;
    connected: boolean;
    fromEnv: boolean;
  };
}

export async function adConfigStatus(): Promise<AdConfigStatus> {
  const r = await readRow();
  const meta = await getMetaConfig();
  const google = await getGoogleConfig();
  return {
    meta: {
      appId: r?.metaAppId || "",
      pageId: r?.metaPageId || "",
      verifyToken: meta.verifyToken,
      hasAppSecret: Boolean(meta.appSecret),
      hasPageToken: Boolean(meta.pageToken),
      connected: metaReady(meta),
      fromEnv: Boolean(!r?.metaAppSecret && env.META_APP_SECRET),
    },
    google: {
      hasKey: Boolean(google.leadsKey),
      connected: googleReady(google),
      fromEnv: Boolean(!r?.googleLeadsKey && env.GOOGLE_LEADS_KEY),
    },
  };
}

/**
 * The fields the Ads form can save. A field left `undefined` is kept as-is; an
 * empty string clears it (so an admin can disconnect). The form sends a secret
 * only when the admin actually types a new one, so a blank secret never wipes a
 * working connection by accident.
 */
export interface AdConfigInput {
  metaAppId?: string;
  metaAppSecret?: string;
  metaPageId?: string;
  metaPageToken?: string;
  metaVerifyToken?: string;
  googleLeadsKey?: string;
}

export async function setAdConfig(
  input: AdConfigInput,
  updatedBy?: string,
): Promise<void> {
  const data: Record<string, string | null> = {};
  const assign = (key: keyof AdConfigInput) => {
    const v = input[key];
    if (v !== undefined) data[key] = v.trim() === "" ? null : v.trim();
  };
  assign("metaAppId");
  assign("metaAppSecret");
  assign("metaPageId");
  assign("metaPageToken");
  assign("metaVerifyToken");
  assign("googleLeadsKey");

  await prisma.adConfig.upsert({
    where: { id: SINGLETON },
    create: { id: SINGLETON, ...data, updatedBy: updatedBy ?? null },
    update: { ...data, updatedBy: updatedBy ?? null },
  });
}
