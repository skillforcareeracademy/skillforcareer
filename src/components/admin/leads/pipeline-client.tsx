"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import type { StageOption } from "@/server/services/lead-pipeline-service";
import { LEAD_STAGES, LEAD_STAGE_LABELS } from "@/lib/validations/lead";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

/**
 * The academy's own pipeline, editable.
 *
 * Every stage says which built-in it behaves like. That is the one thing it
 * cannot do without: the reports, the conversion counting and the automation
 * all read the built-in, so a stage called "Seat Blocked" still counts as an
 * admission pending wherever it matters.
 */
export function PipelineClient({ stages }: { stages: StageOption[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [systemStage, setSystemStage] = useState<string>("FRESH_LEAD");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [statusFor, setStatusFor] = useState<string | null>(null);
  const [statusName, setStatusName] = useState("");

  async function addStage(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.post<{ message: string }>("/api/leads/pipeline/stages", {
        name,
        systemStage,
      });
      toast.success(res.message);
      setName("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't add that.");
    } finally {
      setSaving(false);
    }
  }

  async function patchStage(id: string, body: Record<string, unknown>) {
    setBusy(id);
    try {
      await api.patch(`/api/leads/pipeline/stages/${id}`, body);
      setRenaming(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save that.");
    } finally {
      setBusy(null);
    }
  }

  async function removeStage(stage: StageOption) {
    const others = stages.filter((s) => s.id !== stage.id);
    let moveTo: string | undefined;
    if (others.length > 0) {
      const target = window.prompt(
        `Delete “${stage.name}”. Any leads in it move to which stage?\n\n${others
          .map((s, i) => `${i + 1}. ${s.name}`)
          .join("\n")}\n\nType a number, or leave blank to cancel.`,
      );
      const index = Number(target) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= others.length) return;
      moveTo = others[index].id;
    }
    setBusy(stage.id);
    try {
      const res = await api.del<{ message: string }>(
        `/api/leads/pipeline/stages/${stage.id}${moveTo ? `?moveTo=${moveTo}` : ""}`,
      );
      toast.success(res.message);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't delete that.");
    } finally {
      setBusy(null);
    }
  }

  async function move(index: number, delta: number) {
    const to = index + delta;
    if (to < 0 || to >= stages.length) return;
    const ids = stages.map((s) => s.id);
    [ids[index], ids[to]] = [ids[to], ids[index]];
    setBusy(stages[index].id);
    try {
      await api.patch("/api/leads/pipeline/stages/reorder", { ids });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't reorder.");
    } finally {
      setBusy(null);
    }
  }

  async function addStatus(stageId: string) {
    if (!statusName.trim()) return;
    setBusy(stageId);
    try {
      await api.post("/api/leads/pipeline/statuses", {
        name: statusName,
        stageOptionId: stageId,
      });
      setStatusName("");
      setStatusFor(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't add that.");
    } finally {
      setBusy(null);
    }
  }

  async function removeStatus(id: string) {
    setBusy(id);
    try {
      await api.del(`/api/leads/pipeline/statuses/${id}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't remove that.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/leads"
          className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1.5 text-sm"
        >
          <ChevronLeft className="size-4" /> Back to leads
        </Link>
        <PageHeader
          title="Pipeline stages"
          description="Rename them, reorder them, switch them off or add your own. Each one says which of the built-in stages it behaves like, so your reports keep counting correctly."
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add a stage</CardTitle>
          <CardDescription>
            “Behaves like” decides how it is counted — a stage that means the
            admission is done should behave like Converted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={addStage} className="grid gap-3 sm:grid-cols-[1fr_16rem_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="stage-name">Name</Label>
              <Input
                id="stage-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Seat blocked"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Behaves like</Label>
              <Select value={systemStage} onValueChange={(v) => setSystemStage(String(v))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose">
                    {(v) =>
                      LEAD_STAGE_LABELS[String(v) as keyof typeof LEAD_STAGE_LABELS] ?? "Choose"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {LEAD_STAGES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {LEAD_STAGE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={saving || name.trim().length < 1}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Add
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {stages.map((stage, index) => (
          <Card key={stage.id}>
            <CardContent className="space-y-3 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex shrink-0 gap-0.5">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={busy !== null || index === 0}
                    onClick={() => void move(index, -1)}
                    aria-label={`Move ${stage.name} up`}
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={busy !== null || index === stages.length - 1}
                    onClick={() => void move(index, 1)}
                    aria-label={`Move ${stage.name} down`}
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                </div>

                {renaming?.id === stage.id ? (
                  <>
                    <Input
                      value={renaming.name}
                      onChange={(e) => setRenaming({ id: stage.id, name: e.target.value })}
                      className="h-8 max-w-xs"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void patchStage(stage.id, { name: renaming.name });
                        if (e.key === "Escape") setRenaming(null);
                      }}
                    />
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => void patchStage(stage.id, { name: renaming.name })}
                      aria-label="Save name"
                    >
                      {busy === stage.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Check className="size-4" />
                      )}
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setRenaming(null)}
                      aria-label="Cancel"
                    >
                      <X className="size-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate font-medium">{stage.name}</span>
                    {stage.isDefault && (
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        New leads land here
                      </Badge>
                    )}
                    <Badge variant="secondary" className="shrink-0 text-[10px] font-normal">
                      behaves like {LEAD_STAGE_LABELS[stage.systemStage]}
                    </Badge>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setRenaming({ id: stage.id, name: stage.name })}
                      aria-label={`Rename ${stage.name}`}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-muted-foreground"
                      disabled={busy === stage.id}
                      onClick={() => void removeStage(stage)}
                      aria-label={`Delete ${stage.name}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-4 pl-16">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={stage.isActive}
                    onCheckedChange={(v) => void patchStage(stage.id, { isActive: Boolean(v) })}
                  />
                  <span className="text-muted-foreground">In use</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={stage.isDefault}
                    onCheckedChange={(v) => void patchStage(stage.id, { isDefault: Boolean(v) })}
                  />
                  <span className="text-muted-foreground">New enquiries start here</span>
                </label>
              </div>

              {/* Its sub-statuses — "Fees pending", "Demo booked", and so on. */}
              <div className="space-y-2 pl-16">
                <div className="flex flex-wrap items-center gap-1.5">
                  {stage.statuses.length === 0 && (
                    <span className="text-muted-foreground text-xs">No statuses under it yet.</span>
                  )}
                  {stage.statuses.map((s) => (
                    <Badge key={s.id} variant="secondary" className="gap-1 pr-1 text-xs font-normal">
                      {s.name}
                      <button
                        type="button"
                        onClick={() => void removeStatus(s.id)}
                        aria-label={`Remove ${s.name}`}
                        className="hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                {statusFor === stage.id ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={statusName}
                      onChange={(e) => setStatusName(e.target.value)}
                      placeholder="e.g. Fees pending"
                      className="h-8 max-w-xs"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void addStatus(stage.id);
                        if (e.key === "Escape") setStatusFor(null);
                      }}
                    />
                    <Button size="sm" onClick={() => void addStatus(stage.id)}>
                      Add
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setStatusFor(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground h-7"
                    onClick={() => {
                      setStatusFor(stage.id);
                      setStatusName("");
                    }}
                  >
                    <Plus className="size-3.5" /> Add a status
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
