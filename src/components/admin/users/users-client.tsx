"use client";

import { useCallback, useState, type FormEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Search,
  MoreHorizontal,
  ShieldCheck,
  Ban,
  Trash2,
  CircleCheck,
  Download,
  Plus,
  Pencil,
  UserCog,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { api, ApiError } from "@/lib/api-client";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import { ROLES, ROLE_LABELS, type Role } from "@/config/roles";
import { USER_STATUSES, type ListUsersQuery } from "@/lib/validations/user";
import type { UserRow } from "@/server/services/user-service";

const ROLE_OPTIONS: Role[] = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.INSTRUCTOR,
  ROLES.STUDENT,
];

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  INACTIVE: "bg-muted text-muted-foreground",
  SUSPENDED: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};

const ALL = "all";

const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

const emptyCreate = {
  name: "",
  email: "",
  password: "",
  roleSlug: ROLES.STUDENT as Role,
  status: "ACTIVE" as string,
};

export function UsersClient({
  users,
  total,
  query,
}: {
  users: UserRow[];
  total: number;
  query: ListUsersQuery;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(query.search ?? "");
  const [deleting, setDeleting] = useState<UserRow | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [creating, setCreating] = useState(false);

  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    roleSlug: ROLES.STUDENT as Role,
    status: "ACTIVE" as string,
  });
  const [saving, setSaving] = useState(false);

  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const from = total === 0 ? 0 : (query.page - 1) * query.pageSize + 1;
  const to = Math.min(query.page * query.pageSize, total);

  const usersExportHref = (() => {
    const p = new URLSearchParams();
    if (query.search) p.set("search", query.search);
    if (query.role) p.set("role", query.role);
    if (query.status) p.set("status", query.status);
    const qs = p.toString();
    return `/api/users/export${qs ? `?${qs}` : ""}`;
  })();

  const setParams = useCallback(
    (next: Record<string, string | number | undefined>) => {
      const merged: Record<string, string | number | undefined> = {
        search: query.search,
        role: query.role,
        status: query.status,
        page: query.page,
        ...next,
      };
      const params = new URLSearchParams();
      if (merged.search) params.set("search", String(merged.search));
      if (merged.role) params.set("role", String(merged.role));
      if (merged.status) params.set("status", String(merged.status));
      if (merged.page && Number(merged.page) > 1) {
        params.set("page", String(merged.page));
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, query],
  );

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    setParams({ search: search || undefined, page: 1 });
  }

  async function patchUser(u: UserRow, body: Record<string, string>, msg: string) {
    try {
      await api.patch(`/api/admin/users/${u.id}`, body);
      toast.success(msg);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Update failed.");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.del(`/api/admin/users/${deleting.id}`);
      toast.success("User deleted.");
      setDeleting(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Delete failed.");
    }
  }

  function issueMessage(e: unknown, fallback: string): string {
    const d =
      e instanceof ApiError
        ? (e.details as { issues?: { message: string }[] } | undefined)
        : undefined;
    return (
      d?.issues?.[0]?.message ??
      (e instanceof ApiError ? e.message : fallback)
    );
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post("/api/admin/users", createForm);
      toast.success("User created.");
      setCreateOpen(false);
      setCreateForm(emptyCreate);
      router.refresh();
    } catch (err) {
      toast.error(issueMessage(err, "Couldn't create user."));
    } finally {
      setCreating(false);
    }
  }

  function openEdit(u: UserRow) {
    setEditForm({
      name: u.name,
      email: u.email,
      roleSlug: u.role as Role,
      status: u.status,
    });
    setEditing(u);
  }

  async function onEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      await api.patch(`/api/admin/users/${editing.id}`, editForm);
      toast.success("User updated.");
      setEditing(null);
      router.refresh();
    } catch (err) {
      toast.error(issueMessage(err, "Update failed."));
    } finally {
      setSaving(false);
    }
  }

  async function impersonate(u: UserRow) {
    setImpersonatingId(u.id);
    try {
      const res = await api.post<{ redirect?: string }>(
        `/api/admin/users/${u.id}/impersonate`,
        {},
      );
      toast.success(`Signed in as ${u.name}.`);
      window.location.href = res.redirect ?? "/student";
    } catch (err) {
      toast.error(issueMessage(err, "Couldn't sign in as this user."));
      setImpersonatingId(null);
    }
  }

  const columns: Column<UserRow>[] = [
    {
      key: "user",
      header: "User",
      cell: (u) => {
        const initials = u.name
          .split(" ")
          .map((p) => p[0])
          .slice(0, 2)
          .join("")
          .toUpperCase();
        return (
          <div className="flex items-center gap-3">
            <Avatar className="size-9">
              {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt={u.name} />}
              <AvatarFallback className="bg-gradient-to-br from-rose-500 to-pink-600 text-xs font-semibold text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{u.name}</p>
              <p className="text-muted-foreground truncate text-xs">{u.email}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: "role",
      header: "Role",
      cell: (u) => <Badge variant="secondary">{u.roleLabel}</Badge>,
    },
    {
      key: "status",
      header: "Status",
      cell: (u) => (
        <Badge variant="secondary" className={STATUS_BADGE[u.status]}>
          {u.status.charAt(0) + u.status.slice(1).toLowerCase()}
        </Badge>
      ),
    },
    {
      key: "verified",
      header: "Verified",
      cell: (u) =>
        u.emailVerified ? (
          <CircleCheck className="text-emerald-500 size-4" />
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        ),
    },
    {
      key: "joined",
      header: "Joined",
      cell: (u) => (
        <span className="text-muted-foreground text-xs">
          {formatDistanceToNow(new Date(u.createdAt), { addSuffix: true })}
        </span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      headerClassName: "w-10",
      cell: (u) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" />}
            aria-label="Actions"
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => openEdit(u)}>
              <Pencil className="size-4" /> Edit user
            </DropdownMenuItem>
            {u.role !== ROLES.SUPER_ADMIN && u.role !== ROLES.ADMIN && (
              <DropdownMenuItem
                onClick={() => impersonate(u)}
                disabled={impersonatingId === u.id}
              >
                {impersonatingId === u.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <UserCog className="size-4" />
                )}
                Login as user
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Change role</DropdownMenuLabel>
              {ROLE_OPTIONS.filter((r) => r !== u.role).map((r) => (
                <DropdownMenuItem
                  key={r}
                  onClick={() =>
                    patchUser(u, { roleSlug: r }, `${u.name} is now ${ROLE_LABELS[r]}.`)
                  }
                >
                  Make {ROLE_LABELS[r]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {u.status !== "ACTIVE" && (
              <DropdownMenuItem
                onClick={() => patchUser(u, { status: "ACTIVE" }, "User activated.")}
              >
                <ShieldCheck className="size-4" /> Activate
              </DropdownMenuItem>
            )}
            {u.status !== "SUSPENDED" && (
              <DropdownMenuItem
                onClick={() => patchUser(u, { status: "SUSPENDED" }, "User suspended.")}
              >
                <Ban className="size-4" /> Suspend
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setDeleting(u)}
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
        title="Users"
        description="Manage accounts, roles and access across the platform."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" nativeButton={false} render={<a href={usersExportHref} />}>
              <Download className="size-4" /> Export
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Add user
            </Button>
          </div>
        }
      />

      <DataTable
        columns={columns}
        data={users}
        rowKey={(u) => u.id}
        emptyTitle="No users match your filters"
        toolbar={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <form onSubmit={submitSearch} className="relative max-w-xs flex-1">
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                placeholder="Search name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </form>
            <div className="flex gap-2">
              <Select
                value={query.role ?? ALL}
                onValueChange={(v) => setParams({ role: !v || v === ALL ? undefined : v, page: 1 })}
              >
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All roles</SelectItem>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={query.status ?? ALL}
                onValueChange={(v) => setParams({ status: !v || v === ALL ? undefined : v, page: 1 })}
              >
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  {USER_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.charAt(0) + s.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        }
        footer={
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-sm">
              Showing <span className="font-medium">{from}</span>–
              <span className="font-medium">{to}</span> of{" "}
              <span className="font-medium">{total}</span>
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={query.page <= 1}
                onClick={() => setParams({ page: query.page - 1 })}
              >
                Previous
              </Button>
              <span className="text-muted-foreground text-sm">
                Page {query.page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={query.page >= totalPages}
                onClick={() => setParams({ page: query.page + 1 })}
              >
                Next
              </Button>
            </div>
          </div>
        }
      />

      {/* Create user */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>
              Create an account directly. It&apos;s pre-verified — the person can
              sign in with the password you set.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="c-name">Full name</Label>
              <Input
                id="c-name"
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Priya Nair"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-email">Email</Label>
              <Input
                id="c-email"
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="priya@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-pass">Temporary password</Label>
              <Input
                id="c-pass"
                type="text"
                autoComplete="off"
                value={createForm.password}
                onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="At least 8 characters"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select
                  value={createForm.roleSlug}
                  onValueChange={(v) => setCreateForm((f) => ({ ...f, roleSlug: (v as Role) ?? ROLES.STUDENT }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v) => (v ? ROLE_LABELS[v as Role] : "Select role")}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={createForm.status}
                  onValueChange={(v) => setCreateForm((f) => ({ ...f, status: v ?? "ACTIVE" }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v) => (v ? cap(v) : "Status")}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {USER_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{cap(s)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating && <Loader2 className="size-4 animate-spin" />}
                Create user
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit user */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>
              Update {editing?.name}&apos;s profile, role and access.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onEdit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="e-name">Full name</Label>
              <Input
                id="e-name"
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-email">Email</Label>
              <Input
                id="e-email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select
                  value={editForm.roleSlug}
                  onValueChange={(v) => setEditForm((f) => ({ ...f, roleSlug: (v as Role) ?? ROLES.STUDENT }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v) => (v ? ROLE_LABELS[v as Role] : "Select role")}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={editForm.status}
                  onValueChange={(v) => setEditForm((f) => ({ ...f, status: v ?? "ACTIVE" }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v) => (v ? cap(v) : "Status")}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {USER_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{cap(s)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the account and all associated data. This
              can&apos;t be undone.
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
