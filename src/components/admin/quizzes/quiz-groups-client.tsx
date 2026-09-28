"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronLeft, FolderTree, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

/** The academy's quiz subjects: categories, and sub-categories under them. */
export function QuizGroupsClient({
  categories,
  basePath = "/admin/quizzes",
}: {
  categories: Category[];
  /** Where "Back to quizzes" goes. */
  basePath?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>(TOP);
  const [saving, setSaving] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const totalQuizzes = categories.reduce(
    (sum, c) => sum + c.quizzes + c.children.reduce((s, x) => s + x.quizzes, 0),
    0,
  );

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
      await api.patch(`/api/quiz-categories/${renaming.id}`, { name: renaming.name });
      setRenaming(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Rename failed.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(row: SubCategory, isParent: boolean) {
    const warning = isParent
      ? `Delete “${row.name}” and its sub-categories? The quizzes in them stay, ungrouped.`
      : `Delete “${row.name}”? The quizzes in it stay, ungrouped.`;
    if (!window.confirm(warning)) return;
    setBusy(row.id);
    try {
      const res = await api.del<{ message: string }>(`/api/quiz-categories/${row.id}`);
      toast.success(res.message);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
    } finally {
      setBusy(null);
    }
  }

  function row(item: SubCategory, isParent: boolean) {
    const editing = renaming?.id === item.id;
    return (
      <div
        key={item.id}
        className={`flex items-center gap-2 py-2 ${isParent ? "" : "ml-6 border-l pl-3"}`}
      >
        {editing ? (
          <>
            <Input
              value={renaming.name}
              onChange={(e) => setRenaming({ id: item.id, name: e.target.value })}
              className="h-8 max-w-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void rename();
                if (e.key === "Escape") setRenaming(null);
              }}
            />
            <Button size="icon-sm" variant="ghost" onClick={rename} aria-label="Save name">
              {busy === item.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => setRenaming(null)} aria-label="Cancel">
              <X className="size-4" />
            </Button>
          </>
        ) : (
          <>
            <span className={`min-w-0 flex-1 truncate ${isParent ? "font-medium" : "text-sm"}`}>
              {item.name}
            </span>
            <Badge variant="secondary" className="shrink-0 text-[10px] font-normal">
              {item.quizzes} quiz{item.quizzes === 1 ? "" : "zes"}
            </Badge>
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
              disabled={busy === item.id}
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
    <div className="space-y-6">
      <div>
        <Link
          href={basePath}
          className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1.5 text-sm"
        >
          <ChevronLeft className="size-4" /> Back to quizzes
        </Link>
        <PageHeader
          title="Quiz groups"
          description={`Group papers by subject — a category, and sub-categories under it. ${totalQuizzes} quiz${totalQuizzes === 1 ? "" : "zes"} grouped so far.`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add a group</CardTitle>
          <CardDescription>
            A category such as “Medical Coding”, then sub-categories such as “ICD-10”.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="group-name">Name</Label>
              <Input
                id="group-name"
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
        </CardContent>
      </Card>

      {categories.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title="No groups yet"
          description="Add a category above, then sub-categories under it. Quizzes are filed into them from the quiz's own page."
        />
      ) : (
        <div className="space-y-4">
          {categories.map((c) => (
            <Card key={c.id}>
              <CardContent className="py-4">
                {row(c, true)}
                {c.children.length > 0 && (
                  <div className="mt-1">{c.children.map((child) => row(child, false))}</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
