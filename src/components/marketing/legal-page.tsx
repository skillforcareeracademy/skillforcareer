import type { ReactNode } from "react";
import { Mail, PhoneCall, ScrollText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { siteConfig } from "@/config/site";

const { contact } = siteConfig;

export interface LegalSection {
  /** Anchor id — also what the sidebar links to. */
  id: string;
  heading: string;
  body: ReactNode;
}

/**
 * Shared chrome for the policy pages (privacy, terms, cookies).
 *
 * The three documents differ only in their sections, so the header, the
 * jump-to-section rail and the body typography live here — otherwise the rules
 * for spacing and list styling drift apart across pages nobody reads twice.
 *
 * Body content is plain HTML; the child selectors below style it, since this
 * project has no typography plugin.
 */
export function LegalPage({
  title,
  intro,
  updated,
  sections,
}: {
  title: string;
  intro: string;
  updated: string;
  sections: LegalSection[];
}) {
  return (
    <>
      <section className="relative overflow-hidden border-b">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-32 -left-24 size-[28rem] rounded-full bg-rose-500/10 blur-3xl" />
          <div className="absolute -top-24 right-0 size-[26rem] rounded-full bg-violet-500/10 blur-3xl" />
        </div>

        <div className="container-page py-14 sm:py-16">
          <div className="max-w-3xl">
            <span className="text-primary inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-sm font-medium">
              <ScrollText className="size-4" /> Legal
            </span>
            <h1 className="mt-5 text-4xl leading-tight font-bold sm:text-5xl">{title}</h1>
            <p className="text-muted-foreground mt-4 text-lg text-pretty">{intro}</p>
            <p className="text-muted-foreground mt-4 text-sm">Last updated: {updated}</p>
          </div>
        </div>
      </section>

      <div className="container-page py-12 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-14">
          {/* Jump-to rail — a plain list on mobile, sticky beside the text on
              desktop, so a long policy stays navigable either way. */}
          <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
            <p className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
              On this page
            </p>
            <ol className="space-y-1 text-sm">
              {sections.map((section, i) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="text-muted-foreground hover:text-primary flex gap-2 rounded-md py-1 transition-colors"
                  >
                    <span className="tabular-nums opacity-60">{i + 1}.</span>
                    {section.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="min-w-0">
            <article
              className={[
                "max-w-2xl",
                "[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:sm:text-2xl",
                "[&_p]:text-muted-foreground [&_p]:mt-3 [&_p]:text-[0.95rem] [&_p]:leading-relaxed",
                "[&_ul]:mt-3 [&_ul]:space-y-2 [&_ul]:pl-1",
                "[&_li]:text-muted-foreground [&_li]:relative [&_li]:pl-5 [&_li]:text-[0.95rem] [&_li]:leading-relaxed",
                "[&_li]:before:bg-primary/50 [&_li]:before:absolute [&_li]:before:top-[0.6rem] [&_li]:before:left-0 [&_li]:before:size-1.5 [&_li]:before:rounded-full",
                "[&_strong]:text-foreground [&_strong]:font-semibold",
                "[&_a]:text-primary [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-4",
              ].join(" ")}
            >
              {sections.map((section) => (
                <section
                  key={section.id}
                  id={section.id}
                  className="scroll-mt-24 border-t py-8 first:border-t-0 first:pt-0"
                >
                  <h2>{section.heading}</h2>
                  {section.body}
                </section>
              ))}
            </article>

            <Card className="mt-10 max-w-2xl gap-0 p-6">
              <h2 className="font-semibold">Questions about this policy?</h2>
              <p className="text-muted-foreground mt-1.5 text-sm">
                Write to us and we&apos;ll come back to you. Please mention which document
                you&apos;re asking about.
              </p>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <a
                  href={`mailto:${contact.email}`}
                  className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 transition-colors"
                >
                  <Mail className="size-4" /> {contact.email}
                </a>
                <a
                  href={`tel:${contact.phone}`}
                  className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 transition-colors"
                >
                  <PhoneCall className="size-4" /> {contact.phoneDisplay}
                </a>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
