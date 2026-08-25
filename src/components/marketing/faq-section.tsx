import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ButtonLink } from "@/components/shared/button-link";
import { FAQS, type Faq } from "@/config/marketing";
import { ROUTES } from "@/lib/constants";

/**
 * The questions admissions gets asked before anyone enrols. Sits low on the
 * page — by the time someone scrolls this far they have a specific worry, and
 * answering it there beats making them find the contact form.
 */
export function FaqSection({
  items = FAQS,
  title = "Frequently asked questions",
  description = "Everything students ask us before they enrol. Still unsure? Talk to a counsellor — it's free.",
  className,
}: {
  items?: Faq[];
  title?: string;
  description?: string;
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <section className={className}>
      <div className="container-page py-16 sm:py-24">
        <div className="grid gap-10 lg:grid-cols-3 lg:gap-14">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <h2 className="text-3xl sm:text-4xl">{title}</h2>
            <p className="text-muted-foreground mt-3">{description}</p>
            <ButtonLink href={ROUTES.contact} variant="outline" className="mt-6">
              Ask us anything
            </ButtonLink>
          </div>

          <div className="lg:col-span-2">
            <Accordion multiple className="divide-y rounded-2xl border">
              {items.map((f, i) => (
                <AccordionItem key={f.question} value={String(i)} className="border-b-0 px-5">
                  <AccordionTrigger className="text-left hover:no-underline">
                    <span className="pr-2 font-medium">{f.question}</span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="text-muted-foreground pb-1 text-sm leading-relaxed">
                      {f.answer}
                    </p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </div>
    </section>
  );
}
