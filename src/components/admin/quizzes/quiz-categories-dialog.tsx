"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, FolderTree, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SubCategory {
  id: string;
  name: string;
  quizzes: number;
}
interface Category extends SubCategory {
  children: SubCategory[];
}

const TOP = "top";

/**
 * Quiz grouping, two levels deep. Kept in a dialog rather than on a page of its
 * own: an academy sets its subjects up once and then hardly touches them, and
 * this way it is one click from the quizzes it groups.
 */
export function QuizCategoriesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>(TOP);
  const [saving, setSaving] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ categories: Category[] }>("/api/quiz-categories");
      setCategories(res.categories);
    } catch {
      toast.error("Couldn't load the groups.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetched on a timer rather than straight from the effect body: the dialog
  // should paint before the loading state cascades a second render, which is
  // also what the compiler's `set-state-in-effect` rule is asking for.
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [open, load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.post<{ message: string }>("/api/quiz-categories", {
        name,
        parentId: parentId === TOP ? undefined : parentId,
      });
      toast.success(res.message);
      setName("");
      await load();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  }

  async function rename() {
    if (!renaming) return;
    try {
      await api.patch(`/api/quiz-categories/${renaming.id}`, { name: renaming.name });
      setRenaming(null);
      await load();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Rename failed.");
    }
  }

  async function remove(row: SubCategory, isParent: boolean) {
    const warning = isParent
      ? `Delete “${row.name}” and its sub-categories? The quizzes in them stay, ungrouped.`
      : `Delete “${row.name}”? The quizzes in it stay, ungrouped.`;
    if (!window.confirm(warning)) return;
    try {
      const res = await api.del<{ message: string }>(`/api/quiz-categories/${row.id}`);
      toast.success(res.message);
      await load();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
    }
  }

  function row(item: SubCategory, isParent: boolean) {
    const editing = renaming?.id === item.id;
    return (
      <div
        key={item.id}
        className={`flex items-center gap-2 py-1.5 ${isParent ? "" : "ml-6 border-l pl-3"}`}
      >
        {editing ? (
          <>
            <Input
              value={renaming.name}
              onChange={(e) => setRenaming({ id: item.id, name: e.target.value })}
              className="h-8"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void rename();
                if (e.key === "Escape") setRenaming(null);
              }}
            />
            <Button size="icon-sm" variant="ghost" onClick={rename} aria-label="Save name">
              <Check className="size-4" />
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
            <span className={`min-w-0 flex-1 truncate text-sm ${isParent ? "font-medium" : ""}`}>
              {item.name}
            </span>
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {item.quizzes} quiz{item.quizzes === 1 ? "" : "zes"}
            </span>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => setRenaming({ id: item.id, name: item.name })}
              aria-label={`Rename ${item.name}`}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => remove(item, isParent)}
              aria-label={`Delete ${item.name}`}
            >
              <Trash2 className="size-4" />
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Quiz groups</DialogTitle>
          <DialogDescription>
            Group papers by subject — a category, and sub-categories under it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={add} className="grid gap-3 sm:grid-cols-[1fr_11rem_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Name</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Medical Coding"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Inside</Label>
            <Select value={parentId} onValueChange={(v) => setParentId(v ?? TOP)}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(v) =>
                    !v || v === TOP
                      ? "Top level"
                      : (categories.find((c) => c.id === v)?.name ?? "Top level")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TOP}>Top level</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={saving || name.trim().length < 2}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Add
          </Button>
        </form>

        <div className="max-h-72 overflow-y-auto rounded-lg border p-3">
          {loading ? (
            <p className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </p>
          ) : categories.length === 0 ? (
            <div className="py-8 text-center">
              <FolderTree className="text-muted-foreground mx-auto mb-2 size-6" />
              <p className="text-sm font-medium">No groups yet</p>
              <p className="text-muted-foreground mx-auto mt-1 max-w-xs text-xs">
                Add a category such as “Medical Coding”, then sub-categories such as “ICD-10”.
              </p>
            </div>
          ) : (
            categories.map((c) => (
              <div key={c.id} className="border-b py-1 last:border-0">
                {row(c, true)}
                {c.children.map((child) => row(child, false))}
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
