"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import type { GroupOption } from "@/server/services/content-group-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus } from "lucide-react";
import { GroupPicker } from "./group-picker";

/**
 * The folders one item is filed in, saved as they are ticked.
 *
 * Dropped into an editor that knows nothing about folders: it loads the
 * library, shows what this item is already in, and writes each change straight
 * away. An item that has not been saved yet has no id, so the field waits until
 * it has one rather than pretending.
 */
export function GroupField({
  kind,
  itemId,
  label = "Groups",
  hint,
}: {
  kind: "QUIZ" | "MATERIAL" | "CURRICULUM" | "ASSIGNMENT" | "BATCH" | "CERTIFICATE" | "DISCUSSION";
  itemId: string | null;
  label?: string;
  hint?: string;
}) {
  const [options, setOptions] = useState<GroupOption[]>([]);
  const [value, setValue] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  /** Making a folder without leaving the editor. */
  const [adding, setAdding] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get<{ groups: GroupOption[] }>(`/api/groups?kind=${kind}&flat=1`)
      .then((d) => alive && setOptions(d.groups))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [kind]);

  useEffect(() => {
    if (!itemId) {
      // Deferred a tick: the compiler's `set-state-in-effect` rule rejects a
      // synchronous setState from an effect body.
      const id = setTimeout(() => setReady(true), 0);
      return () => clearTimeout(id);
    }
    let alive = true;
    api
      .get<{ groupIds: string[] }>(
        `/api/groups/assign?kind=${kind}&itemId=${encodeURIComponent(itemId)}`,
      )
      .then((d) => {
        if (alive) setValue(d.groupIds);
      })
      .catch(() => null)
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [itemId, kind]);

  async function change(next: string[]) {
    setValue(next);
    if (!itemId) return;
    try {
      await api.patch("/api/groups/assign", { kind, itemId, groupIds: next });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save the groups.");
    }
  }

  /**
   * Make a folder here rather than going to Groups and back.
   *
   * "Curriculum me group select krne ka option hai pr group banne ka option
   * nhi h" — and the first curriculum anybody writes meets an empty list, so
   * the only path offered was to abandon the form. The new folder is created,
   * added to the list and ticked, all without leaving.
   */
  async function addGroup() {
    const name = adding.trim();
    if (!name || !itemId) return;
    setCreating(true);
    try {
      const res = await api.post<{ id: string }>("/api/groups", { kind, name });
      const refreshed = await api.get<{ groups: GroupOption[] }>(
        `/api/groups?kind=${kind}&flat=1`,
      );
      setOptions(refreshed.groups);
      setAdding("");
      await change([...value, res.id]);
      toast.success(`“${name}” added.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't add that group.");
    } finally {
      setCreating(false);
    }
  }

  if (!itemId) {
    return (
      <p className="text-muted-foreground text-xs">
        Save it first, then you can file it in groups.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <GroupPicker
        label={label}
        hint={hint ?? "Saved as you tick them."}
        options={options}
        value={value}
        onChange={(next) => void change(next)}
        emptyHint={ready ? "No groups yet — make one below." : "Loading…"}
      />
      <div className="flex gap-2">
        <Input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void addGroup();
            }
          }}
          placeholder="New group…"
          className="h-9"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void addGroup()}
          disabled={creating || adding.trim() === ""}
        >
          {creating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          Add
        </Button>
      </div>
    </div>
  );
}
