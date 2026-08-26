"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

function titleCase(seg: string): string {
  return seg
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * A cuid — `cmt9t5y5v000igsu158ccvaon`. Detail routes are keyed by one, and
 * title-casing it put a wall of gibberish in the trail. Matched by shape rather
 * than by route, so every `[id]` page benefits without a registry of paths.
 */
const ID_SEGMENT = /^c[a-z0-9]{20,}$/i;

/** What a detail page is called, by the section it hangs off. */
const DETAIL_LABEL: Record<string, string> = {
  users: "Profile",
  courses: "Course",
  quizzes: "Quiz",
  assignments: "Assignment",
  batches: "Batch",
  webinars: "Webinar",
  leads: "Lead",
};

/** Route-derived breadcrumbs (first segment = "Dashboard"). */
export function DashboardBreadcrumbs() {
  const pathname = usePathname();
  const segs = pathname.split("/").filter(Boolean);
  if (segs.length === 0) return null;

  const crumbs = segs.map((seg, i) => ({
    href: "/" + segs.slice(0, i + 1).join("/"),
    label:
      i === 0
        ? "Dashboard"
        : ID_SEGMENT.test(seg)
          ? (DETAIL_LABEL[segs[i - 1]] ?? "Details")
          : titleCase(seg),
  }));

  return (
    <Breadcrumb className="hidden md:block">
      <BreadcrumbList>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <Fragment key={c.href}>
              <BreadcrumbItem>
                {last ? (
                  <BreadcrumbPage>{c.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink render={<Link href={c.href} />}>
                    {c.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!last && <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
