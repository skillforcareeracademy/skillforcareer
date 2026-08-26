import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ButtonLink } from "@/components/shared/button-link";
import type { HomeData } from "@/lib/validations/homepage";

/**
 * The questions admissions gets asked before anyone enrols. Sits low on the
 * page — by the time someone scrolls this far they have a specific worry, and
 * answering it there beats making them find the contact form.
 *
 * Edited under Admin → Homepage → FAQ; the course pages show the same list, so
 * an answer only has to be written once.
 */
export function FaqSection({
  data,
  className,
}: {
  data: HomeData<"faq">;
  className?: string;
}) {
  if (data.items.length === 0) return null;

  return (
    <section className={className}>
      <div className="container-page py-16 sm:py-24">
        <div className="grid gap-10 lg:grid-cols-3 lg:gap-14">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <h2 className="text-3xl sm:text-4xl">{data.title}</h2>
            {data.description && (
              <p className="text-muted-foreground mt-3">{data.description}</p>
            )}
            {data.ctaLabel && (
              <ButtonLink
                href={data.ctaHref || "/contact"}
                variant="outline"
                className="mt-6"
              >
                {data.ctaLabel}
              </ButtonLink>
            )}
          </div>

          <div className="lg:col-span-2">
            <Accordion multiple className="divide-y rounded-2xl border">
              {data.items.map((faq, i) => (
                <AccordionItem key={i} value={String(i)} className="border-b-0 px-5">
                  <AccordionTrigger className="text-left hover:no-underline">
                    <span className="pr-2 font-medium">{faq.question}</span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="text-muted-foreground pb-1 text-sm leading-relaxed">
                      {faq.answer}
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
