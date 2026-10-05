"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CornerDownRight,
  FolderTree,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import type { GroupNode } from "@/server/services/content-group-service";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FolderSelect } from "./folder-select";
import { cn } from "@/lib/utils";

/**
 * The academy's filing, for one library.
 *
 * "Grouping & multiple sub grouping as per my need" — so nesting has no limit
 * here: any folder can hold folders, and a sub-group's own "Add inside" button
 * is how the next level down is made. Deleting a folder takes its sub-folders
 * with it and leaves what was filed inside un-filed, never deleted.
 */

const TOP = "__top";

export interface GroupManagerCopy {
  /** "Quiz groups", "Material groups", … */
  title: string;
  /** What the folders hold, for the counts. */
  noun: { one: string; many: string };
  /** Where "Back" goes. */
  backHref: string;
  backLabel: string;
  example: string;
}

export function GroupManager({
  kind,
  groups,
  copy,
}: {
  kind: string;
  groups: GroupNode[];
  copy: GroupManagerCopy;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>(TOP);
  const [saving, setSaving] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  /** Every folder, flattened, so the "inside" picker can offer all of them. */
  const flat: GroupNode[] = (function flatten(nodes: GroupNode[]): GroupNode[] {
    return nodes.flatMap((n) => [n, ...flatten(n.children)]);
  })(groups);
  const total = groups.reduce((sum, g) => sum + g.totalCount, 0);

  async function add(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.post<{ message: string }>("/api/groups", {
        kind,
        name,
        parentId: parentId === TOP ? undefined : parentId,
      });
      toast.success(res.message);
      setName("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  }

  async function rename() {
    if (!renaming) return;
    setBusy(renaming.id);
    try {
      await api.patch(`/api/groups/${renaming.id}`, { name: renaming.name });
      setRenaming(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Rename failed.");
    } finally {
      setBusy(null);
    }
  }

  async function move(node: GroupNode, newParent: string) {
    setBusy(node.id);
    try {
      await api.patch(`/api/groups/${node.id}`, {
        parentId: newParent === TOP ? "" : newParent,
      });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't move that.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(node: GroupNode) {
    const warning =
      node.children.length > 0
        ? `Delete “${node.name}” and its ${node.children.length} sub-group${node.children.length === 1 ? "" : "s"}? Nothing filed inside is deleted — it just becomes ungrouped.`
        : `Delete “${node.name}”? Nothing filed inside is deleted — it just becomes ungrouped.`;
    if (!window.confirm(warning)) return;
    setBusy(node.id);
    try {
      const res = await api.del<{ message: string }>(`/api/groups/${node.id}`);
      toast.success(res.message);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
    } finally {
      setBusy(null);
    }
  }

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function row(node: GroupNode) {
    const editing = renaming?.id === node.id;
    const hasKids = node.children.length > 0;
    const open = !collapsed.has(node.id);
    return (
      <div key={node.id}>
        <div
          className="flex flex-wrap items-center gap-2 py-2"
          style={{ paddingLeft: `${node.depth * 1.25}rem` }}
        >
          {hasKids ? (
            <button
              type="button"
              onClick={() => toggle(node.id)}
              aria-label={open ? `Collapse ${node.name}` : `Expand ${node.name}`}
              className="text-muted-foreground hover:text-foreground shrink-0"
            >
              <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} />
            </button>
          ) : (
            <span className="text-muted-foreground/50 shrink-0">
              {node.depth > 0 ? <CornerDownRight className="size-4" /> : <span className="block size-4" />}
            </span>
          )}

          {editing ? (
            <>
              <Input
                value={renaming.name}
                onChange={(e) => setRenaming({ id: node.id, name: e.target.value })}
                className="h-8 max-w-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") void rename();
                  if (e.key === "Escape") setRenaming(null);
                }}
              />
              <Button size="icon-sm" variant="ghost" onClick={rename} aria-label="Save name">
                {busy === node.id ? (
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
              {/* The name comes first and keeps a floor of its own width: it
                  used to be `flex-1 truncate` beside a fixed-width folder
                  picker and four buttons, so on anything narrow it was
                  squeezed to nothing and the row showed no name at all.
                  Tapping it opens the group, which is what people try. */}
              <button
                type="button"
                onClick={() => hasKids && toggle(node.id)}
                className={cn(
                  "min-w-32 flex-1 basis-48 truncate text-left",
                  hasKids && "hover:text-primary cursor-pointer",
                  node.depth === 0 ? "font-medium" : "text-sm",
                )}
                title={node.path}
              >
                {node.name}
              </button>
              <Badge variant="secondary" className="shrink-0 text-[10px] font-normal">
                {node.totalCount} {node.totalCount === 1 ? copy.noun.one : copy.noun.many}
              </Badge>
              {/* Where it sits. Moving a folder takes everything under it. */}
              {/* Where it sits. Moving a folder takes everything under it,
                  so it cannot be offered a home inside itself. */}
              <FolderSelect
                className="h-8 w-40 shrink-0"
                ariaLabel={`Move ${node.name}`}
                options={flat.filter(
                  (g) => g.id !== node.id && !g.path.startsWith(`${node.path} → `),
                )}
                value={node.parentId}
                onChange={(next) => void move(node, next ?? TOP)}
              />
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => {
                  setParentId(node.id);
                  setName("");
                  document.getElementById("group-name")?.focus();
                }}
                aria-label={`Add a sub-group inside ${node.name}`}
                title="Add inside"
              >
                <Plus className="size-4" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => setRenaming({ id: node.id, name: node.name })}
                aria-label={`Rename ${node.name}`}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-muted-foreground"
                disabled={busy === node.id}
                onClick={() => void remove(node)}
                aria-label={`Delete ${node.name}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          )}
        </div>
        {hasKids && open && <div>{node.children.map(row)}</div>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={copy.backHref}
          className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1.5 text-sm"
        >
          <ChevronLeft className="size-4" /> {copy.backLabel}
        </Link>
        <PageHeader
          title={copy.title}
          description={`Nest them as deep as you like. ${total} ${total === 1 ? copy.noun.one : copy.noun.many} filed so far.`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add a group</CardTitle>
          <CardDescription>{copy.example}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-[1fr_18rem_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="group-name">Name</Label>
              <Input
                id="group-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Anatomy"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Inside</Label>
              {/* Searchable: a deep tree is impossible to scan by eye. */}
              <FolderSelect
                className="w-full"
                ariaLabel="Which group to nest it inside"
                options={flat}
                value={parentId === TOP ? null : parentId}
                onChange={(next) => setParentId(next ?? TOP)}
              />
            </div>
            <Button type="submit" disabled={saving || name.trim().length < 1}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Add
            </Button>
          </form>
        </CardContent>
      </Card>

      {groups.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title="No groups yet"
          description="Add one above, then use the + beside it to nest another inside — as many levels as you need."
        />
      ) : (
        <Card>
          <CardContent className="py-3">{groups.map(row)}</CardContent>
        </Card>
      )}
    </div>
  );
}
