"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ExternalLink,
  FileUp,
  GraduationCap,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import type {
  BatchProfile,
  BatchProfileLearner,
} from "@/server/services/batch-profile-service";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { BatchProfileAccess } from "./batch-profile-view";
import { initials, percent, toneFor, when } from "./format";
import { cn } from "@/lib/utils";

export function LearnersTab({
  profile,
  access,
  onImport,
  onAdd,
}: {
  profile: BatchProfile;
  access: BatchProfileAccess;
  onImport: () => void;
  onAdd: () => void;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [removing, setRemoving] = useState<BatchProfileLearner | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profile.learners;
    return profile.learners.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        (l.phone ?? "").includes(q),
    );
  }, [profile.learners, search]);

  async function confirmRemove() {
    if (!removing) return;
    try {
      await api.del(`/api/batches/${profile.id}/students/${removing.userId}`);
      toast.success(`${removing.name} removed from the batch.`);
      setRemoving(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't remove.");
    }
  }

  const columns: Column<BatchProfileLearner>[] = [
    {
      key: "learner",
      header: "Learner",
      cell: (l) => <LearnerCell learner={l} staff={access.isStaff} />,
    },
    {
      key: "attendance",
      header: "Attendance",
      cell: (l) => (
        <div className="text-sm">
          <p
            className={cn(
              "font-medium tabular-nums",
              toneFor(l.attendancePercent),
            )}
          >
            {percent(l.attendancePercent)}
          </p>
          <p className="text-muted-foreground text-xs tabular-nums">
            {l.attended} attended · {l.missed} missed
          </p>
        </div>
      ),
    },
    {
      key: "progress",
      header: "Course progress",
      cell: (l) => (
        <div className="w-28">
          <p className="text-sm tabular-nums">{l.progress}%</p>
          <div className="bg-muted mt-1 h-1.5 overflow-hidden rounded-full">
            <div
              className={cn(
                "h-full rounded-full",
                l.progress >= 100 ? "bg-emerald-500" : "bg-primary",
              )}
              style={{ width: `${Math.min(100, l.progress)}%` }}
            />
          </div>
        </div>
      ),
    },
    {
      key: "quiz",
      header: "Quiz avg",
      cell: (l) => (
        <div className="text-sm">
          <p className={cn("tabular-nums", toneFor(l.quizAverage))}>
            {percent(l.quizAverage)}
          </p>
          <p className="text-muted-foreground text-xs">
            {l.quizzesTaken} taken · {l.assignmentsSubmitted} submitted
          </p>
        </div>
      ),
    },
    {
      key: "seen",
      header: "Last seen",
      cell: (l) => (
        <span className="text-muted-foreground text-sm whitespace-nowrap">
          {l.lastSeenAt
            ? when(l.lastSeenAt, { time: false })
            : "Never signed in"}
        </span>
      ),
    },
    ...(access.canManageRoster
      ? [
          {
            key: "actions",
            header: <span className="sr-only">Actions</span>,
            headerClassName: "w-10",
            cell: (l: BatchProfileLearner) => (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${l.name} from the batch`}
                onClick={() => setRemoving(l)}
              >
                <UserMinus className="size-4" />
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={rows}
        rowKey={(l) => l.userId}
        emptyIcon={GraduationCap}
        emptyTitle={
          search ? "No matching learners" : "No learners on this batch yet"
        }
        emptyDescription={
          search
            ? "Try a different name, email or phone."
            : access.canManageRoster
              ? "Add students one by one, or import a sheet."
              : undefined
        }
        renderCard={(l) => (
          <div className="rounded-xl border p-4">
            <div className="flex items-start justify-between gap-2">
              <LearnerCell learner={l} staff={access.isStaff} />
              {access.canManageRoster && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${l.name} from the batch`}
                  onClick={() => setRemoving(l)}
                >
                  <UserMinus className="size-4" />
                </Button>
              )}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div>
                <p className="text-muted-foreground">Attendance</p>
                <p className={cn("font-medium", toneFor(l.attendancePercent))}>
                  {percent(l.attendancePercent)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Progress</p>
                <p className="font-medium">{l.progress}%</p>
              </div>
              <div>
                <p className="text-muted-foreground">Quiz avg</p>
                <p className={cn("font-medium", toneFor(l.quizAverage))}>
                  {percent(l.quizAverage)}
                </p>
              </div>
            </div>
          </div>
        )}
        toolbar={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Input
              placeholder="Search learners…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="sm:max-w-xs"
            />
            {access.canManageRoster && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={onImport}>
                  <FileUp className="size-4" /> Import CSV
                </Button>
                <Button size="sm" onClick={onAdd}>
                  <UserPlus className="size-4" /> Add students
                </Button>
              </div>
            )}
          </div>
        }
      />

      <AlertDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {removing?.name} from this batch?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They keep access to the course — they just leave this cohort and
              its live classes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemove}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function LearnerCell({
  learner,
  staff,
}: {
  learner: BatchProfileLearner;
  staff: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="size-9 shrink-0">
        {learner.avatarUrl && (
          <AvatarImage src={learner.avatarUrl} alt={learner.name} />
        )}
        <AvatarFallback className="text-xs">
          {initials(learner.name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        {staff ? (
          <Link
            href={`/admin/users/${learner.userId}`}
            className="flex items-center gap-1 truncate font-medium hover:underline"
          >
            {learner.name}
            <ExternalLink className="text-muted-foreground size-3 shrink-0" />
          </Link>
        ) : (
          <p className="truncate font-medium">{learner.name}</p>
        )}
        <p className="text-muted-foreground truncate text-xs">
          {learner.email}
          {learner.phone ? ` · ${learner.phone}` : ""}
        </p>
      </div>
    </div>
  );
}
