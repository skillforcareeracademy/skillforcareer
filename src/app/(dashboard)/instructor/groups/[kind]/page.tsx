import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { GroupKind } from "@/generated/prisma/client";
import { requireGroupWrite } from "@/lib/auth/group-guard";
import { groupTree } from "@/server/services/content-group-service";
import { GroupManager, type GroupManagerCopy } from "@/components/admin/groups/group-manager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Groups" };

/**
 * The instructor's copy of the groups screen — the same tree, linking back into
 * their own panel.
 *
 * `/admin/groups/quiz`, `/admin/groups/material`, and so on — the tree, the
 * copy and the permission all follow from the slug, so a new library needs a
 * line in this map and nothing else.
 */
const LIBRARIES: Record<
  string,
  { kind: GroupKind; copy: GroupManagerCopy }
> = {
  quiz: {
    kind: "QUIZ",
    copy: {
      title: "Quiz groups",
      noun: { one: "quiz", many: "quizzes" },
      backHref: "/instructor/quizzes",
      backLabel: "Back to quizzes",
      example: "A subject such as “Medical Coding”, then “ICD-10”, then “Guidelines” inside that.",
    },
  },
  material: {
    kind: "MATERIAL",
    copy: {
      title: "Material groups",
      noun: { one: "item", many: "items" },
      backHref: "/instructor/materials",
      backLabel: "Back to study material",
      example: "A subject such as “Anatomy”, then “Upper limb”, then “Humerus” inside that.",
    },
  },
  curriculum: {
    kind: "CURRICULUM",
    copy: {
      title: "Curriculum groups",
      noun: { one: "curriculum", many: "curriculums" },
      backHref: "/instructor/curriculum",
      backLabel: "Back to curriculum",
      example: "A course family, then the year, then the intake inside that.",
    },
  },
  assignment: {
    kind: "ASSIGNMENT",
    copy: {
      title: "Assignment groups",
      noun: { one: "assignment", many: "assignments" },
      backHref: "/instructor/assignments",
      backLabel: "Back to assignments",
      example: "A module, then a week, then a topic inside that.",
    },
  },
  batch: {
    kind: "BATCH",
    copy: {
      title: "Batch groups",
      noun: { one: "batch", many: "batches" },
      backHref: "/instructor/batches",
      backLabel: "Back to batches",
      example: "A centre or a mode — “Weekend”, then “Morning” inside it.",
    },
  },
  certificate: {
    kind: "CERTIFICATE",
    copy: {
      title: "Certificate groups",
      noun: { one: "certificate", many: "certificates" },
      backHref: "/instructor/certificates",
      backLabel: "Back to certificates",
      example: "A programme, then the year it was awarded.",
    },
  },
  discussion: {
    kind: "DISCUSSION",
    copy: {
      title: "Discussion groups",
      noun: { one: "discussion", many: "discussions" },
      backHref: "/instructor/discussions",
      backLabel: "Back to discussions",
      example: "A course, then a topic inside it.",
    },
  },
};

export default async function GroupsPage({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const { kind: slug } = await params;
  const library = LIBRARIES[slug.toLowerCase()];
  if (!library) notFound();

  await requireGroupWrite(library.kind);
  const groups = await groupTree(library.kind);
  return <GroupManager kind={library.kind} groups={groups} copy={library.copy} />;
}
