import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Star } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { ButtonLink } from "@/components/shared/button-link";
import { IconGlyph } from "@/components/shared/icon-glyph";
import { getHomeSection } from "@/server/services/homepage-service";

export const dynamic = "force-dynamic";

/**
 * Split-screen shell for all authentication screens.
 *
 * The brand half is content, not code: every word, bullet and the learner
 * quote come from Admin → Homepage → "Sign-in panel", the same registry the
 * header and footer use. Nothing on this side is hardcoded.
 */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const { data } = await getHomeSection("authPanel");
  const features = data.features.filter((f) => f.text.trim());
  const hasQuote = data.showTestimonial && data.quote.trim();

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* ── Brand panel (desktop only) ─────────────────────────────── */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-rose-600 via-fuchsia-700 to-violet-800 p-10 text-white lg:flex xl:p-14">
        {/* decorative glows + dot grid */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -left-16 size-96 rounded-full bg-rose-400/25 blur-3xl" />
          <div className="absolute -right-10 bottom-0 size-[28rem] rounded-full bg-indigo-500/25 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage:
                "radial-gradient(circle, white 1px, transparent 1px)",
              backgroundSize: "26px 26px",
            }}
          />
        </div>

        {/* The real brand mark, on a light chip so a dark logo stays legible
            against the magenta gradient. */}
        <Link href="/" className="relative inline-flex w-fit">
          <span className="rounded-xl bg-white/90 px-3 py-1.5 ring-1 ring-white/40 backdrop-blur">
            <Logo href="" className="h-8" />
          </span>
        </Link>

        {/* headline + features */}
        <div className="relative max-w-md space-y-8">
          <div className="space-y-4">
            {data.heading.trim() && (
              <h2 className="text-4xl leading-[1.1] font-bold tracking-tight text-balance xl:text-5xl">
                {data.heading}
              </h2>
            )}
            {data.subtitle.trim() && (
              <p className="text-lg text-white/85">{data.subtitle}</p>
            )}
          </div>

          {features.length > 0 && (
            <ul className="space-y-3.5">
              {features.map((f, i) => (
                <li key={`${f.text}-${i}`} className="flex items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20 backdrop-blur">
                    <IconGlyph name={f.icon} className="size-4.5 text-white" />
                  </span>
                  <span className="text-sm text-white/90">{f.text}</span>
                </li>
              ))}
            </ul>
          )}

          {hasQuote && (
            <figure className="rounded-2xl bg-white/10 p-5 ring-1 ring-white/15 backdrop-blur">
              {data.stars > 0 && (
                <div className="mb-2 flex gap-0.5">
                  {Array.from({ length: data.stars }).map((_, i) => (
                    <Star key={i} className="size-4 fill-amber-300 text-amber-300" />
                  ))}
                </div>
              )}
              <blockquote className="text-sm leading-relaxed text-white/90">
                &ldquo;{data.quote}&rdquo;
              </blockquote>
              {(data.authorName.trim() || data.authorPhoto.trim()) && (
                <figcaption className="mt-3 flex items-center gap-3">
                  {data.authorPhoto.trim() && (
                    // Not next/image: the photo is admin-supplied, so its host
                    // and intrinsic size aren't known at build time.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={data.authorPhoto}
                      alt={data.authorName || "Learner"}
                      className="size-9 rounded-full object-cover ring-2 ring-white/40"
                    />
                  )}
                  <span className="text-sm font-medium">
                    {[data.authorName, data.authorRole].filter(Boolean).join(" · ")}
                  </span>
                </figcaption>
              )}
            </figure>
          )}
        </div>

        {data.copyright.trim() && (
          <p className="relative text-sm text-white/60">
            {data.copyright.replaceAll("{year}", String(new Date().getFullYear()))}
          </p>
        )}
      </aside>

      {/* ── Form panel ─────────────────────────────────────────────── */}
      <main className="relative flex flex-col">
        <div className="flex items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <ButtonLink href="/" variant="outline" size="sm" className="gap-1.5">
              <ArrowLeft className="size-4" />
              Back to home
            </ButtonLink>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </main>
    </div>
  );
}
