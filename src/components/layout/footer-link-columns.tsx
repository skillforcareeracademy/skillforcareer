"use client";

import Link from "next/link";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export interface FooterColumn {
  title: string;
  links: { label: string; href: string }[];
}

function ColumnLinks({ column }: { column: FooterColumn }) {
  return (
    <ul className="space-y-2.5">
      {column.links.map((link) => (
        <li key={link.label}>
          <Link
            href={link.href}
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            {link.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * The footer's link columns.
 *
 * On a phone three open columns push the contact details a long way down the
 * page, so they collapse into accordion sections there; from the tablet
 * breakpoint up they are plain columns again. The lists are rendered once and
 * re-used by both layouts rather than duplicated into hidden markup.
 *
 * How many columns there are is up to the admin (Admin → Homepage → Footer),
 * so the surrounding grid widens to match — see `GRID_COLS` in the footer.
 */
export function FooterLinkColumns({ columns }: { columns: FooterColumn[] }) {
  const isMobile = useIsMobile();

  if (columns.length === 0) return null;

  if (isMobile) {
    return (
      <div className="col-span-2">
        <Accordion className="divide-y border-y">
          {columns.map((col) => (
            <AccordionItem key={col.title} value={col.title} className="border-b-0">
              <AccordionTrigger className="py-3.5 text-sm font-semibold hover:no-underline">
                {col.title}
              </AccordionTrigger>
              {/* The accordion underlines links by default — fine for prose,
                  wrong for a footer nav. */}
              <AccordionContent className="pb-4 [&_a]:no-underline">
                <ColumnLinks column={col} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    );
  }

  // Below `lg` the footer is a two-column grid, so an odd number of link
  // columns leaves the last one alone on its row — let it take the full width
  // rather than sit beside a hole.
  const orphanLast = columns.length % 2 === 1;

  return (
    <>
      {columns.map((col, i) => (
        <div
          key={col.title}
          className={
            orphanLast && i === columns.length - 1 ? "col-span-2 lg:col-span-1" : undefined
          }
        >
          <h3 className="text-sm font-semibold">{col.title}</h3>
          <div className="mt-4">
            <ColumnLinks column={col} />
          </div>
        </div>
      ))}
    </>
  );
}
