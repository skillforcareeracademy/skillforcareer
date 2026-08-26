import type { Metadata } from "next";
import {
  ArrowRight,
  Clock,
  Mail,
  MapPin,
  MessageCircle,
  PhoneCall,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { EnquiryForm } from "@/components/marketing/enquiry-form";
import { getHomeSection } from "@/server/services/homepage-service";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Contact us",
  description:
    "Talk to Skill For Career Academy about courses, batches, fees and placements — call, WhatsApp, email, or visit our Faridabad and Greater Noida centres.",
};

const { contact } = siteConfig;

const CHANNELS = [
  {
    icon: PhoneCall,
    label: "Call us",
    value: contact.phoneDisplay,
    href: `tel:${contact.phone}`,
    note: "Fastest way to reach a counsellor",
  },
  {
    icon: MessageCircle,
    label: "WhatsApp",
    value: contact.phoneDisplay,
    href: `https://wa.me/${contact.whatsapp}`,
    note: "Send us a message any time",
    external: true,
  },
  {
    icon: Mail,
    label: "Email",
    value: contact.email,
    href: `mailto:${contact.email}`,
    note: "For admissions and course details",
  },
  {
    icon: Clock,
    label: "Office hours",
    value: contact.hours,
    note: "Walk in for free counselling",
  },
];

function mapsHref(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export default async function ContactPage() {
  const enquiry = await getHomeSection("enquiry");

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
            <span className="text-primary inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-sm font-medium">
              <Sparkles className="size-4" /> Free counselling
            </span>
            <h1 className="mt-5 text-4xl leading-[1.1] font-bold sm:text-5xl">
              Talk to us before you{" "}
              <span className="bg-gradient-to-r from-rose-600 to-pink-600 bg-clip-text text-transparent">
                decide anything
              </span>
            </h1>
            <p className="text-muted-foreground mx-auto mt-5 max-w-2xl text-lg text-pretty">
              Course guidance, batch timings, fees and placement support — our counsellors
              answer all of it, whether or not you enrol. Students, parents and working
              professionals are all welcome.
            </p>
          </div>

          {/* Channels */}
          <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {CHANNELS.map(({ icon: Icon, label, value, href, note, external }) => {
              const body = (
                <>
                  <span className="bg-primary/10 text-primary mb-4 grid size-11 place-items-center rounded-xl">
                    <Icon className="size-5" />
                  </span>
                  <h2 className="text-sm font-semibold">{label}</h2>
                  <p className="mt-1 text-sm break-words">{value}</p>
                  <p className="text-muted-foreground mt-2 text-xs">{note}</p>
                </>
              );

              return href ? (
                <a
                  key={label}
                  href={href}
                  {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
                  className="group block h-full"
                >
                  <Card className="hover:border-primary/50 h-full gap-0 p-6 transition-all group-hover:-translate-y-1 group-hover:shadow-lg">
                    {body}
                  </Card>
                </a>
              ) : (
                <Card key={label} className="h-full gap-0 p-6">
                  {body}
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Callback form (shared with the homepage) ─────────────────────── */}
      {enquiry.enabled && <EnquiryForm data={enquiry.data} />}

      {/* ── Centres ──────────────────────────────────────────────────────── */}
      <section className="container-page py-16 sm:py-20">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="text-3xl sm:text-4xl">Visit a centre</h2>
          <p className="text-muted-foreground mt-3">
            Drop in for free career guidance, course guidance and notes — no appointment
            needed.
          </p>
        </div>

        <div className="mx-auto grid max-w-4xl gap-5 sm:grid-cols-2">
          {contact.offices.map((office) => {
            const address = `${office.line1}, ${office.line2}`;
            return (
              <Card key={office.label} className="h-full gap-0 p-6">
                <span className="bg-primary/10 text-primary mb-4 grid size-11 place-items-center rounded-xl">
                  <MapPin className="size-5" />
                </span>
                <h3 className="font-semibold">{office.label} centre</h3>
                <address className="text-muted-foreground mt-1.5 text-sm not-italic">
                  {office.line1}
                  <br />
                  {office.line2}
                </address>

                <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-4 text-sm">
                  <a
                    href={mapsHref(address)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-primary inline-flex items-center gap-1 font-semibold hover:underline"
                  >
                    Get directions <ArrowRight className="size-4" />
                  </a>
                  <a
                    href={`tel:${contact.phone}`}
                    className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
                  >
                    <PhoneCall className="size-3.5" /> Call first
                  </a>
                </div>
              </Card>
            );
          })}
        </div>
      </section>
    </>
  );
}
