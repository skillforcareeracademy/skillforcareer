import type { Metadata } from "next";
import { ArrowLeft, ExternalLink, TriangleAlert } from "lucide-react";
import { requireUser } from "@/lib/auth/require";
import { resolveEmbed } from "@/lib/media";
import { ButtonLink } from "@/components/shared/button-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Viewer" };
export const dynamic = "force-dynamic";

/**
 * Opening something without leaving the panel.
 *
 * "Link daalne ka option which should open in LMS only." A reference on a
 * curriculum section, a recording, a sheet — shown inside the panel with the
 * learner's own navigation still around them, rather than thrown into a
 * browser tab they then have to find their way back from.
 *
 * Only http(s) is opened. The address arrives in the query string, so it is
 * whatever the person typed into their own URL bar — and `javascript:` in an
 * iframe source is a script running on this origin.
 */
export default async function ViewerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();
  const sp = await searchParams;
  const raw = typeof sp.url === "string" ? sp.url : "";
  const title = typeof sp.title === "string" ? sp.title : "Opened from your curriculum";

  let safe: string | null = null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      safe = parsed.toString();
    }
  } catch {
    safe = null;
  }

  const embed = safe ? resolveEmbed(safe) : null;

  return (
    <div className="flex h-[calc(100svh-7rem)] flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <ButtonLink href="/student/curriculum" size="sm" variant="ghost">
            <ArrowLeft className="size-4" /> Back
          </ButtonLink>
          <p className="truncate font-medium">{title}</p>
        </div>
        {safe && (
          // Kept in front of the reader rather than hidden: plenty of sites
          // refuse to be framed at all, and a blank panel with no way out is
          // worse than a new tab.
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={<a href={safe} target="_blank" rel="noreferrer" />}
          >
            <ExternalLink className="size-4" /> Open in a new tab
          </Button>
        )}
      </div>

      {!safe ? (
        <Card>
          <CardContent className="flex items-start gap-3 pt-6">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-500" />
            <div>
              <p className="font-medium">That link can&rsquo;t be opened here</p>
              <p className="text-muted-foreground text-sm">
                Only ordinary web addresses are shown inside the panel. Ask your
                instructor to check the link on this section.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : embed?.kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={embed.src}
          alt={title}
          className="min-h-0 flex-1 rounded-xl border object-contain"
        />
      ) : embed?.kind === "video-file" ? (
        <video src={embed.src} controls className="min-h-0 flex-1 rounded-xl border" />
      ) : embed?.kind === "audio-file" ? (
        <audio src={embed.src} controls className="w-full" />
      ) : (
        <iframe
          src={embed?.src ?? safe}
          title={title}
          className="min-h-0 flex-1 rounded-xl border bg-white"
          // Enough to render a document or a player, and nothing that would
          // let a framed page reach back into this one.
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
          referrerPolicy="no-referrer"
          allow="fullscreen; picture-in-picture"
        />
      )}
    </div>
  );
}
