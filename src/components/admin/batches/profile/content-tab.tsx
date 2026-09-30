"use client";

import { useEffect, useState } from "react";
import { FolderTree, ListChecks, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import type { BatchContentSection } from "@/server/services/batch-content-service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { GroupPicker } from "@/components/admin/groups/group-picker";
import { MultiPicker } from "@/components/admin/groups/multi-picker";

/**
 * Set a cohort's work without opening each piece of it.
 *
 * "Agar batch me se hi ye sab ek sath saari quiz, ek sath study material assign
 * kr paunga to bhot easy ho jayega new batch onboard krna." Two ways to do it,
 * side by side: hand over whole folders, or name individual pieces. The folders
 * are the useful half — anything filed into one later is already set for every
 * cohort holding it, so onboarding a new batch is a handful of taps rather than
 * an afternoon.
 */
export function ContentTab({ batchId }: { batchId: string }) {
  const [sections, setSections] = useState<BatchContentSection[] | null>(null);
  const [draft, setDraft] = useState<Record<string, { groupIds: string[]; itemIds: string[] }>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .get<{ sections: BatchContentSection[] }>(`/api/batches/${batchId}/content`)
      .then((d) => {
        if (!alive) return;
        setSections(d.sections);
        setDraft(
          Object.fromEntries(
            d.sections.map((s) => [s.kind, { groupIds: s.groupIds, itemIds: s.itemIds }]),
          ),
        );
      })
      .catch(() => alive && setSections([]));
    return () => {
      alive = false;
    };
  }, [batchId]);

  async function save(section: BatchContentSection) {
    const next = draft[section.kind];
    if (!next) return;
    setSaving(section.kind);
    try {
      await api.patch(`/api/batches/${batchId}/content`, {
        kind: section.kind,
        groupIds: next.groupIds,
        itemIds: next.itemIds,
      });
      toast.success(`${section.label} saved for this batch.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save that.");
    } finally {
      setSaving(null);
    }
  }

  if (sections === null) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Hand this batch whole groups, or pick single items by name. A group keeps
        giving — anything filed into it later reaches this batch without you
        coming back here.
      </p>

      {sections.map((section) => {
        const next = draft[section.kind] ?? { groupIds: [], itemIds: [] };
        const dirty =
          next.groupIds.join() !== section.groupIds.join() ||
          next.itemIds.join() !== section.itemIds.join();
        return (
          <Card key={section.kind}>
            <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-base">
                  {section.label}
                  <Badge variant="secondary" className="gap-1 text-[10px] font-normal">
                    <FolderTree className="size-3" /> {next.groupIds.length}
                  </Badge>
                  <Badge variant="secondary" className="gap-1 text-[10px] font-normal">
                    <ListChecks className="size-3" /> {next.itemIds.length}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {section.groups.length === 0 && section.items.length === 0
                    ? `No ${section.label.toLowerCase()} to give yet.`
                    : "Groups first, then anything extra by name."}
                </CardDescription>
              </div>
              <Button size="sm" disabled={!dirty || saving === section.kind} onClick={() => void save(section)}>
                {saving === section.kind ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Save
              </Button>
            </CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-2">
              <GroupPicker
                label="Whole groups"
                hint="Everything in them, now and later."
                options={section.groups}
                value={next.groupIds}
                onChange={(groupIds) =>
                  setDraft((d) => ({ ...d, [section.kind]: { ...next, groupIds } }))
                }
                emptyHint="No groups in this library yet."
              />
              <MultiPicker
                label="Single items"
                hint="Only the ones you tick."
                options={section.items.map((i) => ({
                  id: i.id,
                  label: i.hint ? `${i.title} — ${i.hint}` : i.title,
                }))}
                value={next.itemIds}
                onChange={(itemIds) =>
                  setDraft((d) => ({ ...d, [section.kind]: { ...next, itemIds } }))
                }
                emptyHint="Nothing in this library yet."
              />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
