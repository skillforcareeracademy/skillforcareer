import { Construction } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";

/** Placeholder for dashboard routes whose full page ships in a later step. */
export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description="This section is part of the dashboard and is coming soon."
      />
      <EmptyState
        icon={Construction}
        title={`${title} is under construction`}
        description="This page will be built in an upcoming step of the LMS. The navigation, routing and access control around it already work."
      />
    </div>
  );
}

/** Title-case the last path segment (e.g. ["live-classes"] → "Live Classes"). */
export function titleFromSlug(slug: string[]): string {
  const last = slug[slug.length - 1] ?? "Page";
  return last
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
