import type { Metadata } from "next";
import { ArrowRight, MapPin, PhoneCall } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EnquiryForm } from "@/components/marketing/enquiry-form";
import { IconGlyph } from "@/components/shared/icon-glyph";
import { getHomeSection } from "@/server/services/homepage-service";
import { getPageSectionsFor } from "@/server/services/page-service";
import { mapsHref } from "@/lib/maps";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Contact us",
  description:
    "Talk to Skill For Career Academy about courses, batches, fees and placements — call, WhatsApp, email, or visit one of our centres.",
};

export const dynamic = "force-dynamic";

export default async function ContactPage() {
  const [enquiry, page] = await Promise.all([
    getHomeSection("enquiry"),
    getPageSectionsFor(["contact.hero", "contact.offices"] as const),
  ]);

  const hero = page["contact.hero"];
  const centres = page["contact.offices"];
  const channels = hero.data.channels.filter((c) => c.label.trim());
  const offices = centres.data.offices.filter((o) => o.label.trim() || o.line1.trim());

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-32 -left-24 size-[32rem] rounded-full bg-rose-500/15 blur-3xl" />
          <div className="absolute -top-24 right-0 size-[30rem] rounded-full bg-violet-500/15 blur-3xl" />
        </div>

        <div className="container-page py-16 sm:py-20">
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
          </div>

          {/* Channels */}
          {channels.length > 0 && (
            <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {channels.map((channel, i) => {
                const body = (
                  <>
                    <span className="bg-primary/10 text-primary mb-4 grid size-11 place-items-center rounded-xl">
                      <IconGlyph name={channel.icon} className="size-5" />
                    </span>
                    <h2 className="text-sm font-semibold">{channel.label}</h2>
                    <p className="mt-1 text-sm break-words">{channel.value}</p>
                    {channel.note && (
                      <p className="text-muted-foreground mt-2 text-xs">{channel.note}</p>
                    )}
                  </>
                );

                const href = channel.href.trim();
                // Only an off-site address opens in a new tab; tel: and mailto:
                // hand off to the phone or mail app and must not.
                const external = href.startsWith("http");

                return href ? (
                  <a
                    key={`${channel.label}-${i}`}
                    href={href}
                    {...(external
                      ? { target: "_blank", rel: "noreferrer noopener" }
                      : {})}
                    className="group block h-full"
                  >
                    <Card className="hover:border-primary/50 h-full gap-0 p-6 transition-all group-hover:-translate-y-1 group-hover:shadow-lg">
                      {body}
                    </Card>
                  </a>
                ) : (
                  <Card key={`${channel.label}-${i}`} className="h-full gap-0 p-6">
                    {body}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── Callback form (shared with the homepage) ─────────────────────── */}
      {enquiry.enabled && <EnquiryForm data={enquiry.data} />}

      {/* ── Centres ──────────────────────────────────────────────────────── */}
      {offices.length > 0 && (
        <section className="container-page py-16 sm:py-20">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="text-3xl sm:text-4xl">{centres.data.title}</h2>
            {centres.data.description && (
              <p className="text-muted-foreground mt-3">{centres.data.description}</p>
            )}
          </div>

          <div className="mx-auto grid max-w-4xl gap-5 sm:grid-cols-2">
            {offices.map((office, i) => (
              <Card key={`${office.label}-${i}`} className="h-full gap-0 p-6">
                <span className="bg-primary/10 text-primary mb-4 grid size-11 place-items-center rounded-xl">
                  <MapPin className="size-5" />
                </span>
                <h3 className="font-semibold">{office.label}</h3>
                <address className="text-muted-foreground mt-1.5 text-sm not-italic">
                  {office.line1}
                  {office.line2 && (
                    <>
                      <br />
                      {office.line2}
                    </>
                  )}
                </address>

                <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-4 text-sm">
                  <a
                    href={mapsHref(office)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-primary inline-flex items-center gap-1 font-semibold hover:underline"
                  >
                    Get directions <ArrowRight className="size-4" />
                  </a>
                  <a
                    href={`tel:${siteConfig.contact.phone}`}
                    className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
                  >
                    <PhoneCall className="size-3.5" /> Call first
                  </a>
                </div>
              </Card>
            ))}
          </div>

          {centres.data.footnote && (
            <p className="text-muted-foreground mt-8 text-center text-xs">
              {centres.data.footnote}
            </p>
          )}
        </section>
      )}
    </>
  );
}
