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

/**
 * The group pages hang off the section they file, not off a "Groups" of their
 * own — "it should be like Dashboard > Study Material > Material Groups".
 * The route is `/<role>/groups/<kind>`, which on its own reads
 * "Dashboard > Groups > Material" and points nowhere useful.
 */
const GROUP_SECTION: Record<
  string,
  { label: string; href: string; groups: string }
> = {
  material: {
    label: "Study material",
    href: "materials",
    groups: "Material groups",
  },
  quiz: { label: "Quizzes", href: "quizzes", groups: "Quiz groups" },
  assignment: {
    label: "Assignments",
    href: "assignments",
    groups: "Assignment groups",
  },
  curriculum: {
    label: "Curriculum",
    href: "curriculum",
    groups: "Curriculum groups",
  },
};

/** Route-derived breadcrumbs (first segment = "Dashboard"). */
export function DashboardBreadcrumbs() {
  const pathname = usePathname();
  const segs = pathname.split("/").filter(Boolean);
  if (segs.length === 0) return null;

  // `/<role>/groups/<kind>` reads as its own section plus "<Kind> groups".
  const section =
    segs[1] === "groups" ? GROUP_SECTION[segs[2] ?? ""] : undefined;
  if (section) {
    return (
      <Trail
        crumbs={[
          { href: `/${segs[0]}`, label: "Dashboard" },
          { href: `/${segs[0]}/${section.href}`, label: section.label },
          { href: pathname, label: section.groups },
        ]}
      />
    );
  }

  const crumbs = segs.map((seg, i) => ({
    href: "/" + segs.slice(0, i + 1).join("/"),
    label:
      i === 0
        ? "Dashboard"
        : ID_SEGMENT.test(seg)
          ? (DETAIL_LABEL[segs[i - 1]] ?? "Details")
          : titleCase(seg),
  }));

  return <Trail crumbs={crumbs} />;
}

/** The trail itself — the last crumb is the page, the rest are links. */
function Trail({ crumbs }: { crumbs: { href: string; label: string }[] }) {
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
