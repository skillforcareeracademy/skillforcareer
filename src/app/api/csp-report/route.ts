import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Where the browser posts anything the content policy would have blocked.
 *
 * The policy ships in report-only mode first: a Content-Security-Policy has
 * to name every script, style and frame the app loads, and the way you find
 * out you missed one is that the page stops working for everybody. Reported
 * rather than enforced, a mistake costs a log line.
 *
 * Deliberately quiet about failures and always 204: this endpoint is open to
 * the internet by necessity, and an attacker learns nothing from it.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      "csp-report"?: Record<string, unknown>;
    } | null;
    const report = body?.["csp-report"] ?? body;
    if (report && typeof report === "object") {
      const r = report as Record<string, unknown>;
      logger.warn("csp.violation", {
        directive: String(r["violated-directive"] ?? r.effectiveDirective ?? "?"),
        blocked: String(r["blocked-uri"] ?? r.blockedURL ?? "?"),
        // Where it happened, so a one-off on a single page is obvious.
        document: String(r["document-uri"] ?? r.documentURL ?? "?"),
      });
    }
  } catch {
    // A malformed report is not worth an error response.
  }
  return new NextResponse(null, { status: 204 });
}
