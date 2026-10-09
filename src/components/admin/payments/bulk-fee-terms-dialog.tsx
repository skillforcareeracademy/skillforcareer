"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Scale } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import {
  BULK_TERMS_SCOPES,
  BULK_TERMS_SCOPE_LABEL,
  type BulkTermsScope,
} from "@/lib/validations/payment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Opt {
  id: string;
  title: string;
}

/**
 * One set of fee terms, applied across the board.
 *
 * "For this we should have an option to set default from our end and apply to
 * all students or batch or course option should be there. Coz for every
 * student we can not add this."
 *
 * A box left empty is left alone, so the grace period can be changed without
 * disturbing a penalty rate the office has already tuned. Nothing is charged
 * by pressing this: late fees only accrue from the nightly sweep, and that is
 * off until the academy turns it on.
 */
export function BulkFeeTermsDialog({
  open,
  onOpenChange,
  batches,
  courses,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batches: Opt[];
  courses: Opt[];
}) {
  const router = useRouter();
  const [scope, setScope] = useState<BulkTermsScope>("ALL");
  const [batchId, setBatchId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [graceDays, setGraceDays] = useState("");
  const [penaltyPercent, setPenaltyPercent] = useState("");
  const [penaltyFlat, setPenaltyFlat] = useState("");
  const [skipCustomised, setSkipCustomised] = useState(true);
  const [saving, setSaving] = useState(false);

  const blank = (v: string) => (v.trim() === "" ? undefined : Number(v));
  const nothingSet =
    blank(graceDays) === undefined &&
    blank(penaltyPercent) === undefined &&
    blank(penaltyFlat) === undefined;

  async function apply() {
    setSaving(true);
    try {
      const res = await api.post<{ message: string }>("/api/payments/fee-terms", {
        scope,
        batchId: scope === "BATCH" ? batchId : "",
        courseId: scope === "COURSE" ? courseId : "",
        graceDays: blank(graceDays),
        penaltyPercent: blank(penaltyPercent),
        penaltyFlat: blank(penaltyFlat),
        skipCustomised,
      });
      toast.success(res.message);
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Couldn't apply those terms.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="size-4" /> Apply fee terms
          </DialogTitle>
          <DialogDescription>
            Set a grace period and a penalty once and put it on every unsettled
            plan in the scope you choose. Leave a box empty to leave that figure
            as it is.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Apply to</Label>
            <Select
              value={scope}
              onValueChange={(v) => v && setScope(v as BulkTermsScope)}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(v) => BULK_TERMS_SCOPE_LABEL[v as BulkTermsScope]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {BULK_TERMS_SCOPES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {BULK_TERMS_SCOPE_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {scope === "BATCH" && (
            <div className="space-y-1.5">
              <Label>Batch</Label>
              <Select value={batchId} onValueChange={(v) => setBatchId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a batch">
                    {(v) =>
                      batches.find((b) => b.id === v)?.title ?? "Choose a batch"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {batches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {scope === "COURSE" && (
            <div className="space-y-1.5">
              <Label>Course</Label>
              <Select value={courseId} onValueChange={(v) => setCourseId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a course">
                    {(v) =>
                      courses.find((c) => c.id === v)?.title ?? "Choose a course"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="bulk-grace">Grace period (days)</Label>
              <Input
                id="bulk-grace"
                type="number"
                min={0}
                max={90}
                value={graceDays}
                onChange={(e) => setGraceDays(e.target.value)}
                placeholder="Leave as is"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bulk-percent">Penalty (%)</Label>
              <Input
                id="bulk-percent"
                type="number"
                min={0}
                max={100}
                step="0.5"
                value={penaltyPercent}
                onChange={(e) => setPenaltyPercent(e.target.value)}
                placeholder="Leave as is"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bulk-flat">…or flat (₹)</Label>
              <Input
                id="bulk-flat"
                type="number"
                min={0}
                value={penaltyFlat}
                onChange={(e) => setPenaltyFlat(e.target.value)}
                placeholder="Leave as is"
              />
            </div>
          </div>

          <label className="hover:bg-accent/40 flex cursor-pointer items-start justify-between gap-3 rounded-lg border p-3">
            <span className="space-y-0.5">
              <span className="block text-sm font-medium">
                Don&rsquo;t touch plans with their own terms
              </span>
              <span className="text-muted-foreground block text-xs">
                Leaves any learner the office has already given different terms
                exactly as they are.
              </span>
            </span>
            <Switch checked={skipCustomised} onCheckedChange={setSkipCustomised} />
          </label>

          <p className="rounded-lg border border-amber-500/30 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
            This sets the terms only. Nothing is charged until payment reminders
            are switched on under Settings → Fees.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void apply()} disabled={saving || nothingSet}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Apply to {BULK_TERMS_SCOPE_LABEL[scope].toLowerCase()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
