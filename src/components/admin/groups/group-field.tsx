"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import type { GroupOption } from "@/server/services/content-group-service";
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

  if (!itemId) {
    return (
      <p className="text-muted-foreground text-xs">
        Save it first, then you can file it in groups.
      </p>
    );
  }

  return (
    <GroupPicker
      label={label}
      hint={hint ?? "Saved as you tick them."}
      options={options}
      value={value}
      onChange={(next) => void change(next)}
      emptyHint={ready ? "No groups yet — add some under Groups." : "Loading…"}
    />
  );
}
