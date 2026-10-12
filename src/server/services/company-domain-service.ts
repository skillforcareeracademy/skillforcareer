import { randomBytes } from "node:crypto";
import { promises as dns } from "node:dns";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";

/**
 * The addresses a company's panel answers on.
 *
 * Two kinds. A **subdomain** of the academy's own domain is free and instant:
 * the academy already controls the apex, so there is nothing for the company
 * to prove or to point. A **custom** domain is the company's own, and follows
 * the same shape every platform uses — point a CNAME here, add a TXT record
 * to prove you own it, then we check both for real over DNS.
 */

/** The academy's own domain, which free subdomains hang off. */
export const ROOT_DOMAIN = (
  process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "skillforcareer.com"
)
  .replace(/^https?:\/\//, "")
  .replace(/^www\./, "")
  .replace(/\/.*$/, "")
  .toLowerCase();

/** Where a custom domain is pointed. */
export const CNAME_TARGET =
  process.env.NEXT_PUBLIC_DOMAIN_CNAME ?? `cname.${ROOT_DOMAIN}`;

/** Where the wildcard that serves every tenant subdomain points. */
export const CNAME_TARGET_WILDCARD =
  process.env.NEXT_PUBLIC_WILDCARD_CNAME ?? "cname.vercel-dns.com";

/** Whether a name exists in DNS at all, by either kind of record. */
async function hostResolves(host: string): Promise<boolean> {
  for (const lookup of [dns.resolveCname, dns.resolve4, dns.resolve6]) {
    try {
      const found = await lookup.call(dns, host);
      if (found.length > 0) return true;
    } catch {
      // Try the next record type.
    }
  }
  return false;
}

/** Names nobody may take as a subdomain — they are the academy's own. */
const RESERVED = new Set([
  "www", "api", "admin", "app", "mail", "smtp", "imap", "ftp", "cdn",
  "assets", "static", "blog", "help", "support", "docs", "status",
  "login", "signup", "auth", "account", "billing", "pay", "checkout",
  "cname", "ns1", "ns2", "mx", "dev", "staging", "test", "demo",
]);

/** A label is a DNS label: letters, digits and hyphens, not at the ends. */
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
/** A whole hostname, for a custom domain. */
const HOSTNAME = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export function normaliseHost(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
}

export interface DomainRow {
  id: string;
  host: string;
  kind: string;
  status: string;
  isPrimary: boolean;
  verifyToken: string | null;
  lastError: string | null;
  verifiedAt: string | null;
  /** Exactly what the company has to put in their DNS, in order. */
  records: { type: string; name: string; value: string }[];
}

function recordsFor(host: string, kind: string, token: string | null) {
  if (kind === "SUBDOMAIN") {
    // The one-time setup that makes *every* tenant subdomain resolve. Shown
    // against the subdomain itself because that is where somebody discovers it
    // is missing — by the address not opening.
    return [
      { type: "CNAME", name: "*", value: "cname.vercel-dns.com" },
    ];
  }
  const apex = host.split(".").length === 2;
  return [
    apex
      ? { type: "A", name: "@", value: "76.76.21.21" }
      : { type: "CNAME", name: host.split(".")[0], value: CNAME_TARGET },
    ...(token
      ? [
          {
            type: "TXT",
            name: `_sfc-verify.${host.split(".").slice(0, -2).join(".") || "@"}`,
            value: token,
          },
        ]
      : []),
  ];
}

function toRow(d: {
  id: string;
  host: string;
  kind: string;
  status: string;
  isPrimary: boolean;
  verifyToken: string | null;
  lastError: string | null;
  verifiedAt: Date | null;
}): DomainRow {
  return {
    id: d.id,
    host: d.host,
    kind: d.kind,
    status: d.status,
    isPrimary: d.isPrimary,
    verifyToken: d.verifyToken,
    lastError: d.lastError,
    verifiedAt: d.verifiedAt?.toISOString() ?? null,
    records: recordsFor(d.host, d.kind, d.verifyToken),
  };
}

export async function listDomains(companyId: string): Promise<DomainRow[]> {
  const rows = await prisma.companyDomain.findMany({
    where: { companyId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
  return rows.map(toRow);
}

/** Whether a subdomain label is free. Used by the UI as you type. */
export async function subdomainAvailable(label: string): Promise<{
  available: boolean;
  reason?: string;
}> {
  const name = label.trim().toLowerCase();
  if (!LABEL.test(name)) {
    return {
      available: false,
      reason: "Letters, numbers and hyphens only, and not at either end.",
    };
  }
  if (name.length < 3) return { available: false, reason: "At least 3 characters." };
  if (RESERVED.has(name)) return { available: false, reason: "That name is reserved." };
  const taken = await prisma.companyDomain.findFirst({
    where: { host: `${name}.${ROOT_DOMAIN}` },
    select: { id: true },
  });
  return taken
    ? { available: false, reason: "Already taken." }
    : { available: true };
}

export async function addDomain(
  companyId: string,
  input: { host: string; kind: "SUBDOMAIN" | "CUSTOM" },
): Promise<string> {
  const host =
    input.kind === "SUBDOMAIN"
      ? `${input.host.trim().toLowerCase()}.${ROOT_DOMAIN}`
      : normaliseHost(input.host);

  if (input.kind === "SUBDOMAIN") {
    const free = await subdomainAvailable(input.host);
    if (!free.available) throw AppError.badRequest(free.reason ?? "Not available.");
  } else {
    if (!HOSTNAME.test(host)) {
      throw AppError.badRequest("That doesn't look like a domain name.");
    }
    if (host === ROOT_DOMAIN || host.endsWith(`.${ROOT_DOMAIN}`)) {
      throw AppError.badRequest(
        `${ROOT_DOMAIN} is the academy's own — add it as a free subdomain instead.`,
      );
    }
  }

  const clash = await prisma.companyDomain.findFirst({
    where: { host },
    select: { id: true },
  });
  if (clash) throw AppError.conflict("That address is already in use.");

  const first = await prisma.companyDomain.count({ where: { companyId } });
  const made = await prisma.companyDomain.create({
    data: {
      companyId,
      host,
      kind: input.kind,
      // Nothing is live until DNS says so, a subdomain included. It used to
      // be marked verified on the spot — "it is our own domain, what is there
      // to check" — and the answer turned out to be the wildcard record,
      // without which every tenant address is NXDOMAIN while the panel calls
      // it Live.
      status: "PENDING",
      verifiedAt: null,
      verifyToken:
        input.kind === "SUBDOMAIN"
          ? null
          : `sfc-verify=${randomBytes(16).toString("hex")}`,
      isPrimary: first === 0,
    },
    select: { id: true },
  });
  return made.id;
}

/**
 * Look the records up for real.
 *
 * Both halves have to hold: the TXT proves the company owns the name, and the
 * CNAME proves it is pointed here. Checking only ownership would let somebody
 * claim a domain they never aim at us; checking only the CNAME would let
 * anybody point a name at us and claim it.
 */
export async function verifyDomain(id: string): Promise<DomainRow> {
  const d = await prisma.companyDomain.findUnique({ where: { id } });
  if (!d) throw AppError.notFound("That domain isn't here.");

  let error: string | null = null;

  // A subdomain of our own apex has nothing to prove — but it does have to
  // exist. One wildcard record covers every tenant; until it is there, the
  // address does not resolve at all.
  if (d.kind === "SUBDOMAIN") {
    const resolves = await hostResolves(d.host);
    const updated = await prisma.companyDomain.update({
      where: { id },
      data: {
        status: resolves ? "VERIFIED" : "FAILED",
        verifiedAt: resolves ? new Date() : null,
        lastError: resolves
          ? null
          : `${d.host} doesn't resolve. Add a wildcard CNAME for * on ${ROOT_DOMAIN} pointing at ${CNAME_TARGET_WILDCARD}, and add *.${ROOT_DOMAIN} to the hosting project. One record covers every company.`,
        lastCheckedAt: new Date(),
      },
    });
    return toRow(updated);
  }

  const txtName = `_sfc-verify.${d.host}`;
  try {
    const txt = (await dns.resolveTxt(txtName)).map((parts) => parts.join(""));
    if (!d.verifyToken || !txt.includes(d.verifyToken)) {
      error = `No matching TXT record at ${txtName} yet.`;
    }
  } catch {
    error = `Couldn't read a TXT record at ${txtName} yet.`;
  }

  if (!error) {
    try {
      const cname = await dns.resolveCname(d.host);
      const points = cname.some(
        (c) => c.replace(/\.$/, "").toLowerCase() === CNAME_TARGET.toLowerCase(),
      );
      if (!points) error = `${d.host} doesn't point at ${CNAME_TARGET} yet.`;
    } catch {
      // An apex cannot carry a CNAME, so an A record is the alternative.
      try {
        const a = await dns.resolve4(d.host);
        if (a.length === 0) error = `${d.host} has no A record yet.`;
      } catch {
        error = `${d.host} doesn't point here yet.`;
      }
    }
  }

  const updated = await prisma.companyDomain.update({
    where: { id },
    data: {
      status: error ? "FAILED" : "VERIFIED",
      verifiedAt: error ? null : new Date(),
      lastError: error,
      lastCheckedAt: new Date(),
    },
  });
  return toRow(updated);
}

/** One primary per company — links have to be written with something. */
export async function setPrimaryDomain(id: string): Promise<void> {
  const d = await prisma.companyDomain.findUnique({
    where: { id },
    select: { companyId: true, status: true },
  });
  if (!d) throw AppError.notFound("That domain isn't here.");
  if (d.status !== "VERIFIED") {
    throw AppError.badRequest("Verify it before making it the main address.");
  }
  await prisma.companyDomain.updateMany({
    where: { companyId: d.companyId },
    data: { isPrimary: false },
  });
  await prisma.companyDomain.updateMany({
    where: { id },
    data: { isPrimary: true },
  });
}

export async function removeDomain(id: string): Promise<void> {
  const d = await prisma.companyDomain.findUnique({
    where: { id },
    select: { companyId: true, isPrimary: true },
  });
  if (!d) throw AppError.notFound("That domain isn't here.");
  await prisma.companyDomain.delete({ where: { id } });
  if (!d.isPrimary) return;
  // Something has to be primary; the oldest survivor takes it.
  const next = await prisma.companyDomain.findFirst({
    where: { companyId: d.companyId, status: "VERIFIED" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (next) {
    await prisma.companyDomain.updateMany({
      where: { id: next.id },
      data: { isPrimary: true },
    });
  }
}

/** Which company an incoming request belongs to, by its Host header. */
export async function companyForHost(host: string): Promise<string | null> {
  const clean = normaliseHost(host).replace(/:\d+$/, "");
  if (!clean || clean === ROOT_DOMAIN || clean === `www.${ROOT_DOMAIN}`) return null;
  const row = await prisma.companyDomain.findFirst({
    where: { host: clean, status: "VERIFIED" },
    select: { companyId: true },
  });
  return row?.companyId ?? null;
}
