"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Pencil, Trash2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { CategoryDialog } from "./category-dialog";
import type { CategoryRow } from "@/server/services/category-service";

export function CategoriesClient({ initial }: { initial: CategoryRow[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [deleting, setDeleting] = useState<CategoryRow | null>(null);

  const data = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return initial;
    return initial.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q),
    );
  }, [initial, search]);

  const parents = initial.map((c) => ({ id: c.id, name: c.name }));

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(row: CategoryRow) {
    setEditing(row);
    setDialogOpen(true);
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.del(`/api/admin/categories/${deleting.id}`);
      toast.success("Category deleted.");
      setDeleting(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Delete failed.");
    }
  }

  const columns: Column<CategoryRow>[] = [
    {
      key: "name",
      header: "Name",
      cell: (r) => (
        <div className="font-medium">
          {r.name}
          {r.parentName && (
            <span className="text-muted-foreground font-normal">
              {" "}
              · {r.parentName}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "slug",
      header: "Slug",
      cell: (r) => (
        <span className="text-muted-foreground font-mono text-xs">{r.slug}</span>
      ),
    },
    { key: "courses", header: "Courses", cell: (r) => r.courseCount, className: "tabular-nums" },
    { key: "order", header: "Order", cell: (r) => r.order, className: "tabular-nums" },
    {
      key: "status",
      header: "Status",
      cell: (r) =>
        r.isActive ? (
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            Active
          </Badge>
        ) : (
          <Badge variant="secondary">Hidden</Badge>
        ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      headerClassName: "w-10",
      cell: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" />}
            aria-label="Actions"
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEdit(r)}>
              <Pencil className="size-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setDeleting(r)}
            >
              <Trash2 className="size-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categories"
        description="Organize your catalog into categories and sub-categories."
        actions={
          <Button onClick={openNew}>
            <Plus className="size-4" /> New category
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={data}
        rowKey={(r) => r.id}
        emptyTitle="No categories yet"
        emptyDescription="Create your first category to organize courses."
        toolbar={
          <div className="relative max-w-xs">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              placeholder="Search categories…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        }
      />

      <CategoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        parents={parents}
        onSaved={() => router.refresh()}
      />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This can&apos;t be undone. Categories that still have courses or
              sub-categories can&apos;t be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
