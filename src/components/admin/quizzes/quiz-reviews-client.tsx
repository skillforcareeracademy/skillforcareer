"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Flag, Loader2, MessageSquare, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { REVIEW_STATUS_LABEL } from "@/lib/validations/question-review";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface ReviewRow {
  id: string;
  ref: string;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  message: string | null;
  reply: string | null;
  studentName: string;
  studentEmail: string;
  quizId: string;
  quizTitle: string;
  questionNo: number;
  questionText: string;
  resolvedByName: string | null;
}

const ALL = "all";
const STATUSES = ["OPEN", "RECTIFIED", "INVALID"];

/**
 * The queue of "this question looks wrong" from learners.
 *
 * Two answers, both of which reach the learner by email and in their dashboard:
 * the question was wrong and has been fixed, or the question stands. The
 * wording is filled in for whoever is on the queue and can be edited before it
 * goes.
 */
export function QuizReviewsClient({
  reviews,
  total,
  open,
  status,
  page,
  pageSize,
  basePath,
  quizBasePath,
}: {
  reviews: ReviewRow[];
  total: number;
  open: number;
  status?: string;
  page: number;
  pageSize: number;
  basePath: string;
  /** Where "Open the quiz" goes — /admin/quizzes or /instructor/quizzes. */
  quizBasePath: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function setStatus(next: string) {
    const params = new URLSearchParams();
    if (next && next !== ALL) params.set("status", next);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  async function answer(row: ReviewRow, verdict: "RECTIFIED" | "INVALID") {
    setSaving(row.id);
    try {
      await api.patch(`/api/quiz-reviews/${row.id}`, {
        status: verdict,
        reply: drafts[row.id]?.trim() || undefined,
      });
      toast.success("The learner has been told — by email and in their dashboard.");
      setDrafts((d) => ({ ...d, [row.id]: "" }));
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't send that.");
    } finally {
      setSaving(null);
    }
  }

  function statusBadge(value: string) {
    if (value === "RECTIFIED") {
      return (
        <Badge variant="secondary" className="gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
          <CheckCircle2 className="size-3" /> {REVIEW_STATUS_LABEL[value]}
        </Badge>
      );
    }
    if (value === "INVALID") {
      return (
        <Badge variant="secondary" className="gap-1 bg-muted text-muted-foreground">
          <XCircle className="size-3" /> {REVIEW_STATUS_LABEL[value]}
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="gap-1 bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
        <Flag className="size-3" /> {REVIEW_STATUS_LABEL[value]}
      </Badge>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Question reviews"
        description={
          open > 0
            ? `${open} request${open === 1 ? "" : "s"} waiting for an answer.`
            : "Learners can flag a question they think is wrong. Nothing is waiting."
        }
        actions={
          <Select value={status ?? ALL} onValueChange={(v) => setStatus(v ?? ALL)}>
            <SelectTrigger className="w-44">
              <SelectValue>
                {(v) => (!v || v === ALL ? "All requests" : REVIEW_STATUS_LABEL[String(v)])}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All requests</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {REVIEW_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {reviews.length === 0 ? (
        <EmptyState
          icon={Flag}
          title="Nothing here"
          description="When a learner flags a question, it lands here for you or the instructor to answer."
        />
      ) : (
        <div className="space-y-4">
          {reviews.map((row) => (
            <Card key={row.id}>
              <CardContent className="space-y-3 py-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {row.ref}
                      {statusBadge(row.status)}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {row.studentName} · {row.studentEmail} ·{" "}
                      {new Date(row.createdAt).toLocaleString("en-IN")}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`${quizBasePath}/${row.quizId}`} />}>
                    Open the quiz
                  </Button>
                </div>

                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-xs font-medium">
                    Question {row.questionNo} · {row.quizTitle}
                  </p>
                  <p className="mt-1 text-sm">{row.questionText}</p>
                  {row.message && (
                    <p className="text-muted-foreground mt-2 flex items-start gap-1.5 text-xs">
                      <MessageSquare className="mt-0.5 size-3.5 shrink-0" />
                      <span>{row.message}</span>
                    </p>
                  )}
                </div>

                {row.status === "OPEN" ? (
                  <div className="space-y-2">
                    <Textarea
                      rows={2}
                      value={drafts[row.id] ?? ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [row.id]: e.target.value }))}
                      placeholder="Leave blank to send the standard wording for whichever answer you pick."
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={saving === row.id}
                        onClick={() => answer(row, "RECTIFIED")}
                      >
                        {saving === row.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="size-4" />
                        )}
                        They were right — rectified
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={saving === row.id}
                        onClick={() => answer(row, "INVALID")}
                      >
                        <XCircle className="size-4" /> The question is right
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className={cn("text-sm", row.status === "RECTIFIED" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                    {row.reply}
                    {row.resolvedByName && (
                      <span className="text-muted-foreground"> — {row.resolvedByName}</span>
                    )}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}

          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-sm">
              {total} request{total === 1 ? "" : "s"}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => router.push(`${basePath}?page=${page - 1}${status ? `&status=${status}` : ""}`)}
              >
                Previous
              </Button>
              <span className="text-muted-foreground text-sm">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => router.push(`${basePath}?page=${page + 1}${status ? `&status=${status}` : ""}`)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
