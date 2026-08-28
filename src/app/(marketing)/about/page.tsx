import type { Metadata } from "next";
import Image from "next/image";
import { ArrowRight, Building2, MapPin, UsersRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/shared/button-link";
import { StatsBand } from "@/components/marketing/stats-band";
import { PlacedStudents } from "@/components/marketing/placed-students";
import { IconGlyph } from "@/components/shared/icon-glyph";
import { getHomeSection } from "@/server/services/homepage-service";
import { getPageSectionsFor } from "@/server/services/page-service";
import { mapsHref } from "@/lib/maps";
import { socialFor } from "@/config/social";

export const metadata: Metadata = {
  title: "About us",
  description:
    "Skill For Career Academy empowers learners with practical, job-ready skills — IIT-qualified instructors, hands-on training and a modern LMS, online and offline.",
};

export const dynamic = "force-dynamic";

export default async function AboutPage() {
  // The stats and placement bands are the homepage's, shown here from the same
  // content; everything else on this page is edited under Admin → Pages.
  const [stats, placed, page] = await Promise.all([
    getHomeSection("stats"),
    getHomeSection("placedStudents"),
    getPageSectionsFor([
      "about.hero",
      "about.mission",
      "about.founders",
      "about.values",
      "contact.offices",
    ] as const),
  ]);

  const hero = page["about.hero"];
  const mission = page["about.mission"];
  const founders = page["about.founders"];
  const values = page["about.values"];
  const offices = page["contact.offices"];

  const people = founders.data.people.filter((p) => p.name.trim());

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-32 -left-24 size-[32rem] rounded-full bg-rose-500/15 blur-3xl" />
          <div className="absolute -top-24 right-0 size-[30rem] rounded-full bg-violet-500/15 blur-3xl" />
        </div>

        <div className="container-page py-16 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            {hero.data.badge && (
              <span className="text-primary inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-sm font-medium">
                <IconGlyph name="Sparkles" className="size-4" /> {hero.data.badge}
              </span>
            )}
            <h1 className="mt-5 text-4xl leading-[1.1] font-bold sm:text-5xl">
              {hero.data.titleLead}{" "}
              <span className="bg-gradient-to-r from-rose-600 to-pink-600 bg-clip-text text-transparent">
                {hero.data.titleHighlight}
              </span>
            </h1>
            {hero.data.subtitle && (
              <p className="text-muted-foreground mx-auto mt-5 max-w-2xl text-lg text-pretty">
                {hero.data.subtitle}
              </p>
            )}
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              {hero.data.primaryLabel && (
                <ButtonLink href={hero.data.primaryHref || "/courses"} size="lg">
                  {hero.data.primaryLabel} <ArrowRight className="size-4" />
                </ButtonLink>
              )}
              {hero.data.secondaryLabel && (
                <ButtonLink
                  href={hero.data.secondaryHref || "/contact"}
                  size="lg"
                  variant="outline"
                >
                  {hero.data.secondaryLabel}
                </ButtonLink>
              )}
            </div>
          </div>
        </div>
      </section>

      {stats.enabled && <StatsBand data={stats.data} />}

      {/* ── Mission ──────────────────────────────────────────────────────── */}
      {mission.enabled && (
        <section className="container-page py-16 sm:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
            <div className="max-w-xl">
              {mission.data.badge && (
                <span className="text-primary inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-sm font-medium">
                  <IconGlyph name="Target" className="size-4" /> {mission.data.badge}
                </span>
              )}
              <h2 className="mt-4 text-3xl sm:text-4xl">{mission.data.title}</h2>

              <div className="text-muted-foreground mt-5 space-y-4 text-base">
                {mission.data.paragraphs
                  .filter((p) => p.text.trim())
                  .map((p, i) => (
                    <p key={i}>{p.text}</p>
                  ))}
              </div>

              {mission.data.audience.length > 0 && (
                <ul className="mt-7 grid gap-2.5 sm:grid-cols-2">
                  {mission.data.audience
                    .filter((a) => a.text.trim())
                    .map((who) => (
                      <li key={who.text} className="flex items-start gap-2.5 text-sm">
                        <UsersRound className="text-primary mt-0.5 size-4 shrink-0" />
                        {who.text}
                      </li>
                    ))}
                </ul>
              )}
            </div>

            {mission.data.imageUrl && (
              <div className="relative">
                <div className="relative aspect-4/3 overflow-hidden rounded-3xl border shadow-xl">
                  <Image
                    src={mission.data.imageUrl}
                    alt={mission.data.imageAlt || "Skill For Career Academy"}
                    fill
                    sizes="(min-width: 1024px) 40vw, 100vw"
                    className="object-cover"
                    unoptimized
                    priority
                  />
                </div>
                {/* Small floating proof card — deliberately offset so the photo
                    doesn't read as a stock banner. */}
                {mission.data.statValue && (
                  <Card className="bg-card absolute -bottom-6 left-6 max-w-60 gap-0 p-4 shadow-xl sm:left-10">
                    <p className="text-2xl font-bold">{mission.data.statValue}</p>
                    <p className="text-muted-foreground text-xs">
                      {mission.data.statLabel}
                    </p>
                  </Card>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Founders ─────────────────────────────────────────────────────── */}
      {founders.enabled && people.length > 0 && (
        <section className="bg-muted/30 border-y">
          <div className="container-page py-16 sm:py-20">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              {founders.data.badge && (
                <span className="text-primary inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-sm font-medium">
                  <IconGlyph name="UsersRound" className="size-4" />{" "}
                  {founders.data.badge}
                </span>
              )}
              <h2 className="mt-4 text-3xl sm:text-4xl">{founders.data.title}</h2>
              {founders.data.description && (
                <p className="text-muted-foreground mt-3">{founders.data.description}</p>
              )}
            </div>

            <div
              className={
                people.length === 1
                  ? "mx-auto max-w-2xl"
                  : "mx-auto grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3"
              }
            >
              {people.map((person) => (
                <Card key={person.name} className="h-full gap-0 overflow-hidden p-0">
                  {person.photoUrl ? (
                    <div className="bg-muted relative aspect-4/3 w-full">
                      <Image
                        src={person.photoUrl}
                        alt={person.name}
                        fill
                        sizes="(min-width: 1024px) 30vw, 100vw"
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  ) : (
                    <div className="bg-primary/10 text-primary grid aspect-4/3 w-full place-items-center text-4xl font-bold">
                      {person.name.trim().charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div className="p-6">
                    <h3 className="text-lg font-semibold">{person.name}</h3>
                    {person.role && (
                      <p className="text-primary text-sm font-medium">{person.role}</p>
                    )}
                    {person.bio && (
                      <p className="text-muted-foreground mt-3 text-sm">{person.bio}</p>
                    )}
                    {person.linkedin && (
                      <a
                        href={person.linkedin}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-muted-foreground hover:text-primary mt-4 inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
                      >
                        {/* lucide dropped its brand glyphs; the site keeps its
                            own social paths in config/social. */}
                        <svg viewBox="0 0 24 24" fill="currentColor" className="size-4">
                          <path d={socialFor("linkedin").path} />
                        </svg>
                        LinkedIn
                      </a>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── What makes us stand out ──────────────────────────────────────── */}
      {values.enabled && values.data.items.length > 0 && (
        <section className="border-b">
          <div className="container-page py-16 sm:py-20">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <h2 className="text-3xl sm:text-4xl">{values.data.title}</h2>
              {values.data.description && (
                <p className="text-muted-foreground mt-3">{values.data.description}</p>
              )}
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {values.data.items.map((item) => (
                <Card key={item.title} className="h-full gap-0 p-6">
                  <span className="bg-primary/10 text-primary mb-4 grid size-11 place-items-center rounded-xl">
                    <IconGlyph name={item.icon} className="size-5" />
                  </span>
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="text-muted-foreground mt-1.5 text-sm">{item.body}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

      {placed.enabled && <PlacedStudents data={placed.data} />}

      {/* ── Where to find us ─────────────────────────────────────────────── */}
      {offices.data.offices.length > 0 && (
        <section className="container-page py-16 sm:py-20">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="text-3xl sm:text-4xl">{offices.data.title}</h2>
            {offices.data.description && (
              <p className="text-muted-foreground mt-3">{offices.data.description}</p>
            )}
          </div>

          <div className="mx-auto grid max-w-4xl gap-5 sm:grid-cols-2">
            {offices.data.offices.map((office, i) => (
              <Card key={`${office.label}-${i}`} className="h-full gap-0 p-6">
                <span className="bg-primary/10 text-primary mb-4 grid size-11 place-items-center rounded-xl">
                  <MapPin className="size-5" />
                </span>
                <h3 className="font-semibold">{office.label}</h3>
                <p className="text-muted-foreground mt-1.5 text-sm">
                  {office.line1}
                  {office.line2 && (
                    <>
                      <br />
                      {office.line2}
                    </>
                  )}
                </p>
                <a
                  href={mapsHref(office)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-primary mt-4 inline-flex items-center gap-1 text-sm font-semibold hover:underline"
                >
                  Open in Google Maps <ArrowRight className="size-4" />
                </a>
              </Card>
            ))}
          </div>

          {offices.data.footnote && (
            <p className="text-muted-foreground mx-auto mt-8 flex max-w-4xl items-center justify-center gap-2 text-center text-xs">
              <Building2 className="size-3.5 shrink-0" aria-hidden />
              {offices.data.footnote}
            </p>
          )}
        </section>
      )}
    </>
  );
}
