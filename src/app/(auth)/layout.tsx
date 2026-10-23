import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Star } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { ButtonLink } from "@/components/shared/button-link";
import { IconGlyph } from "@/components/shared/icon-glyph";
import { getHomeSection } from "@/server/services/homepage-service";
import { imageProps } from "@/lib/image-sizes";

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
                      {...imageProps(data.authorPhoto, 36)}
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
        {/* Mobile-only: a branded gradient header so signing in on a phone
            feels like an app, not a bare form on white. Desktop keeps the
            split-screen above and hides this. */}
        <div className="relative overflow-hidden bg-gradient-to-br from-rose-600 via-fuchsia-700 to-violet-800 px-5 pt-6 pb-16 text-white lg:hidden">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -top-20 -left-12 size-72 rounded-full bg-rose-400/25 blur-3xl" />
            <div className="absolute -right-8 -bottom-10 size-80 rounded-full bg-indigo-500/25 blur-3xl" />
            <div
              className="absolute inset-0 opacity-[0.12]"
              style={{
                backgroundImage:
                  "radial-gradient(circle, white 1px, transparent 1px)",
                backgroundSize: "22px 22px",
              }}
            />
          </div>

          <div className="relative flex items-center justify-between">
            <Link href="/" className="inline-flex">
              <span className="rounded-lg bg-white/90 px-2.5 py-1 ring-1 ring-white/40 backdrop-blur">
                <Logo href="" className="h-7" />
              </span>
            </Link>
            <ButtonLink
              href="/"
              variant="outline"
              size="sm"
              className="gap-1.5 border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              <ArrowLeft className="size-4" /> Home
            </ButtonLink>
          </div>

          {(data.heading.trim() || data.subtitle.trim()) && (
            <div className="relative mt-6 max-w-[19rem]">
              {data.heading.trim() && (
                <h1 className="text-2xl leading-tight font-bold tracking-tight text-balance">
                  {data.heading}
                </h1>
              )}
              {data.subtitle.trim() && (
                <p className="mt-2 text-sm leading-relaxed text-white/85">
                  {data.subtitle}
                </p>
              )}
            </div>
          )}

          {features.length > 0 && (
            <ul className="relative mt-5 flex flex-wrap gap-2">
              {features.slice(0, 3).map((f, i) => (
                <li
                  key={`${f.text}-${i}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.12] px-3 py-1 text-xs ring-1 ring-white/15 backdrop-blur"
                >
                  <IconGlyph name={f.icon} className="size-3.5 text-white" />
                  {f.text}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Desktop-only control bar. */}
        <div className="hidden items-center justify-end px-4 py-5 sm:px-6 lg:flex lg:px-8">
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <ButtonLink href="/" variant="outline" size="sm" className="gap-1.5">
              <ArrowLeft className="size-4" />
              Back to home
            </ButtonLink>
          </div>
        </div>

        {/* The form itself — lifted to overlap the gradient on a phone,
            centred in the panel on desktop. */}
        <div className="flex flex-1 justify-center px-4 pb-10 sm:px-6 lg:items-center lg:py-8">
          <div className="relative z-10 -mt-10 w-full max-w-sm lg:mt-0">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
