import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  GraduationCap,
  Radio,
  Award,
  Briefcase,
  Star,
} from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { ButtonLink } from "@/components/shared/button-link";
import { siteConfig } from "@/config/site";
import { pexelsAvatar } from "@/config/marketing";

const FEATURES = [
  { icon: Radio, label: "Live interactive classes with expert mentors" },
  { icon: Award, label: "Verified certificates on completion" },
  { icon: Briefcase, label: "Placement support · 100+ hiring partners" },
];

/** Split-screen shell for all authentication screens. */
export default function AuthLayout({ children }: { children: ReactNode }) {
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

        {/* logo */}
        <Link href="/" className="relative inline-flex w-fit items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
            <GraduationCap className="size-5 text-white" aria-hidden />
          </span>
          <span className="text-lg font-semibold tracking-tight">
            {siteConfig.name}
          </span>
        </Link>

        {/* headline + features */}
        <div className="relative max-w-md space-y-8">
          <div className="space-y-4">
            <h2 className="text-4xl leading-[1.1] font-bold tracking-tight text-balance xl:text-5xl">
              Learn the skills. Build the career.
            </h2>
            <p className="text-lg text-white/85">
              Join 1,000+ learners upskilling with live classes, real-world
              projects and verified certificates.
            </p>
          </div>

          <ul className="space-y-3.5">
            {FEATURES.map((f) => (
              <li key={f.label} className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20 backdrop-blur">
                  <f.icon className="size-4.5 text-white" aria-hidden />
                </span>
                <span className="text-sm text-white/90">{f.label}</span>
              </li>
            ))}
          </ul>

          {/* testimonial */}
          <figure className="rounded-2xl bg-white/10 p-5 ring-1 ring-white/15 backdrop-blur">
            <div className="mb-2 flex gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="size-4 fill-amber-300 text-amber-300" />
              ))}
            </div>
            <blockquote className="text-sm leading-relaxed text-white/90">
              “The live mentorship and projects helped me switch into data
              science with a 2× salary jump.”
            </blockquote>
            <figcaption className="mt-3 flex items-center gap-3">
              <Image
                src={pexelsAvatar(7580822)}
                alt="Learner"
                width={36}
                height={36}
                className="size-9 rounded-full object-cover ring-2 ring-white/40"
              />
              <span className="text-sm font-medium">Priya N. · Data Scientist</span>
            </figcaption>
          </figure>
        </div>

        <p className="relative text-sm text-white/60">
          © {new Date().getFullYear()} {siteConfig.name}
        </p>
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
