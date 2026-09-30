"use client";

import { useCallback, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Search,
  Target,
  MoreHorizontal,
  ShieldCheck,
  Ban,
  Trash2,
  CircleCheck,
  Download,
  Plus,
  Pencil,
  UserCog,
  IdCard,
  Loader2,
  Upload,
  AlertCircle,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { api, ApiError } from "@/lib/api-client";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { PermissionGroup } from "@/server/services/role-service";
import { UserPermissionsDialog } from "./user-permissions-dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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
  ROLES.SALES_AGENT,
];

/** What the API hands back when the email is taken, so the admin can add a role instead. */
interface ExistingAccount {
  id: string;
  name: string;
  role: string;
  roleLabel: string;
  extraRoles: { slug: string; label: string }[];
}

interface ImportResult {
  created: number;
  rolesAdded: number;
  skipped: number;
  errors: { row: number; email: string; reason: string }[];
  message: string;
}

const STATUS_BADGE: Record<string, string> = {
  ACTIVE:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  PENDING:
    "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  INACTIVE: "bg-muted text-muted-foreground",
  SUSPENDED: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};

const ALL = "all";
/** A file download, not a page — a plain link, not client navigation. */
const IMPORT_TEMPLATE_HREF = "/api/admin/users/template";

const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

const emptyCreate = {
  name: "",
  email: "",
  password: "",
  roleSlug: ROLES.STUDENT as Role,
  status: "ACTIVE" as string,
};

/** The nine cuts the admissions team asked for, beside role and status. */
const FEE_OPTIONS = [
  { value: "paid", label: "Fees fully paid" },
  { value: "partial", label: "Part paid" },
  { value: "unpaid", label: "Nothing paid" },
];
const PERFORMANCE_OPTIONS = [
  { value: "strong", label: "Strong (75%+)" },
  { value: "average", label: "Average (40–74%)" },
  { value: "weak", label: "Weak (under 40%)" },
  { value: "none", label: "No quiz taken" },
];

/** One filter dropdown, so nine of them read the same. */
function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
  width,
}: {
  value: string | undefined;
  onChange: (next: string | undefined) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  width: string;
}) {
  return (
    <Select
      value={value ?? ALL}
      onValueChange={(v) => onChange(!v || v === ALL ? undefined : String(v))}
    >
      <SelectTrigger className={width}>
        <SelectValue placeholder={placeholder}>
          {(v) =>
            !v || v === ALL
              ? placeholder
              : (options.find((o) => o.value === v)?.label ?? placeholder)
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function UsersClient({
  users,
  total,
  query,
  courses = [],
  batches = [],
  permissionCatalog = [],
  canManageRoles = false,
}: {
  users: UserRow[];
  total: number;
  query: ListUsersQuery;
  courses?: { id: string; title: string }[];
  batches?: { id: string; name: string }[];
  /** Every permission that can be given to one person, grouped for the dialog. */
  permissionCatalog?: PermissionGroup[];
  /** Whether the viewer may hand out permissions at all. */
  canManageRoles?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [permissionsFor, setPermissionsFor] = useState<string | null>(null);
  const [search, setSearch] = useState(query.search ?? "");
  const [deleting, setDeleting] = useState<UserRow | null>(null);
  const hasFilters = Boolean(
    query.role ||
    query.status ||
    query.courseId ||
    query.batchId ||
    query.fees ||
    query.verified ||
    query.profile ||
    query.delayed ||
    query.performance ||
    query.placed,
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [creating, setCreating] = useState(false);
  // Shown inside the dialog, not only as a toast: a toast in the corner is
  // easy to miss on a tablet, and the admin was left with a button that
  // seemed to do nothing.
  const [createError, setCreateError] = useState<string | null>(null);
  const [existingAccount, setExistingAccount] =
    useState<ExistingAccount | null>(null);
  const [addingRole, setAddingRole] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importCsv, setImportCsv] = useState("");
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importRole, setImportRole] = useState<Role>(ROLES.STUDENT);
  const [importAddRole, setImportAddRole] = useState(true);
  const [importWelcome, setImportWelcome] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    roleSlug: ROLES.STUDENT as Role,
    status: "ACTIVE" as string,
    extraRoles: [] as string[],
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
        courseId: query.courseId,
        batchId: query.batchId,
        fees: query.fees,
        verified: query.verified,
        profile: query.profile,
        delayed: query.delayed,
        performance: query.performance,
        placed: query.placed,
        page: query.page,
        ...next,
      };
      const params = new URLSearchParams();
      for (const key of [
        "search",
        "role",
        "status",
        "courseId",
        "batchId",
        "fees",
        "verified",
        "profile",
        "delayed",
        "performance",
        "placed",
      ] as const) {
        if (merged[key]) params.set(key, String(merged[key]));
      }
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

  async function patchUser(
    u: UserRow,
    body: Record<string, string>,
    msg: string,
  ) {
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
      d?.issues?.[0]?.message ?? (e instanceof ApiError ? e.message : fallback)
    );
  }

  function openCreate(open: boolean) {
    setCreateOpen(open);
    setCreateError(null);
    setExistingAccount(null);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    setExistingAccount(null);
    try {
      await api.post("/api/admin/users", createForm);
      toast.success("User created. A welcome email is on its way.");
      setCreateOpen(false);
      setCreateForm(emptyCreate);
      router.refresh();
    } catch (err) {
      const existing =
        err instanceof ApiError
          ? (err.details as { existing?: ExistingAccount } | undefined)
              ?.existing
          : undefined;
      if (existing) setExistingAccount(existing);
      else setCreateError(issueMessage(err, "Couldn't create user."));
    } finally {
      setCreating(false);
    }
  }

  async function addRoleToExisting() {
    if (!existingAccount) return;
    setAddingRole(true);
    try {
      await api.post(`/api/admin/users/${existingAccount.id}/roles`, {
        roleSlug: createForm.roleSlug,
      });
      toast.success(
        `${existingAccount.name} is now also ${ROLE_LABELS[createForm.roleSlug]}.`,
      );
      setCreateOpen(false);
      setCreateForm(emptyCreate);
      setExistingAccount(null);
      router.refresh();
    } catch (err) {
      setCreateError(issueMessage(err, "Couldn't add the role."));
    } finally {
      setAddingRole(false);
    }
  }

  async function onImportFile(file: File | undefined) {
    if (!file) return;
    setImportFileName(file.name);
    setImportCsv(await file.text());
    setImportResult(null);
  }

  async function runImport() {
    setImporting(true);
    try {
      const result = await api.post<ImportResult>("/api/admin/users/import", {
        csv: importCsv,
        defaultRole: importRole,
        addRoleToExisting: importAddRole,
        sendWelcome: importWelcome,
      });
      setImportResult(result);
      toast.success(result.message);
      router.refresh();
    } catch (err) {
      toast.error(issueMessage(err, "Import failed."));
    } finally {
      setImporting(false);
    }
  }

  function openEdit(u: UserRow) {
    setEditForm({
      name: u.name,
      email: u.email,
      roleSlug: u.role as Role,
      status: u.status,
      extraRoles: u.extraRoles.map((r) => r.slug),
    });
    setEditing(u);
  }

  async function onEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      const { extraRoles, ...profile } = editForm;
      await api.patch(`/api/admin/users/${editing.id}`, profile);
      const before = editing.extraRoles
        .map((r) => r.slug)
        .sort()
        .join();
      const after = extraRoles.filter((r) => r !== profile.roleSlug).sort();
      if (after.join() !== before) {
        await api.patch(`/api/admin/users/${editing.id}/roles`, {
          extraRoles: after,
        });
      }
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
              <Link
                href={`/admin/users/${u.id}`}
                className="hover:text-primary block truncate text-sm font-medium transition-colors"
              >
                {u.name}
              </Link>
              <p className="text-muted-foreground truncate text-xs">
                {u.email}
              </p>
              {/* The enquiry they came from, so their history is one tap away. */}
              {u.lead && (
                <Link
                  href={`/admin/leads?lead=${u.lead.id}`}
                  className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                >
                  <Target className="size-3" />
                  {u.lead.leadNo ?? "From a lead"}
                </Link>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: "role",
      header: "Role",
      cell: (u) => (
        <div className="flex flex-wrap items-center gap-1">
          <Badge variant="secondary">{u.roleLabel}</Badge>
          {u.extraRoles.map((r) => (
            <Badge key={r.slug} variant="outline" title="Also holds this role">
              + {r.label}
            </Badge>
          ))}
        </div>
      ),
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
      key: "fees",
      header: "Fees paid",
      cell: (u) =>
        u.paidTotal > 0 ? (
          <span className="text-sm font-medium tabular-nums">
            ₹{u.paidTotal.toLocaleString("en-IN")}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        ),
    },
    {
      key: "verified",
      header: "Verified",
      cell: (u) =>
        u.emailVerified ? (
          <CircleCheck className="size-4 text-emerald-500" />
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
            <DropdownMenuItem
              nativeButton={false}
              render={<Link href={`/admin/users/${u.id}`} />}
            >
              <IdCard className="size-4" /> View profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openEdit(u)}>
              <Pencil className="size-4" /> Edit user
            </DropdownMenuItem>
            {/* One person's own access, beside their role: "sirf shagun ko
                dena hai". */}
            {canManageRoles && (
              <DropdownMenuItem onClick={() => setPermissionsFor(u.id)}>
                <ShieldCheck className="size-4" /> Permissions
              </DropdownMenuItem>
            )}
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
                    patchUser(
                      u,
                      { roleSlug: r },
                      `${u.name} is now ${ROLE_LABELS[r]}.`,
                    )
                  }
                >
                  Make {ROLE_LABELS[r]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {u.status !== "ACTIVE" && (
              <DropdownMenuItem
                onClick={() =>
                  patchUser(u, { status: "ACTIVE" }, "User activated.")
                }
              >
                <ShieldCheck className="size-4" /> Activate
              </DropdownMenuItem>
            )}
            {u.status !== "SUSPENDED" && (
              <DropdownMenuItem
                onClick={() =>
                  patchUser(u, { status: "SUSPENDED" }, "User suspended.")
                }
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
            <Button
              variant="outline"
              nativeButton={false}
              render={<a href={usersExportHref} />}
            >
              <Download className="size-4" /> Export
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setImportResult(null);
                setImportOpen(true);
              }}
            >
              <Upload className="size-4" /> Import
            </Button>
            <Button onClick={() => openCreate(true)}>
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
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <form
                onSubmit={submitSearch}
                className="relative max-w-xs flex-1"
              >
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
                  onValueChange={(v) =>
                    setParams({
                      role: !v || v === ALL ? undefined : v,
                      page: 1,
                    })
                  }
                >
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="All roles">
                      {(v) =>
                        !v || v === ALL
                          ? "All roles"
                          : (ROLE_LABELS[
                              String(v) as keyof typeof ROLE_LABELS
                            ] ?? "All roles")
                      }
                    </SelectValue>
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
                  onValueChange={(v) =>
                    setParams({
                      status: !v || v === ALL ? undefined : v,
                      page: 1,
                    })
                  }
                >
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="All statuses">
                      {(v) =>
                        !v || v === ALL
                          ? "All statuses"
                          : String(v).charAt(0) +
                            String(v).slice(1).toLowerCase()
                      }
                    </SelectValue>
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

            {/* The cuts admissions actually works from. */}
            <div className="flex flex-wrap items-center gap-2">
              <FilterSelect
                width="w-52"
                placeholder="Any course"
                value={query.courseId}
                onChange={(v) => setParams({ courseId: v, page: 1 })}
                options={courses.map((c) => ({ value: c.id, label: c.title }))}
              />
              <FilterSelect
                width="w-48"
                placeholder="Any batch"
                value={query.batchId}
                onChange={(v) => setParams({ batchId: v, page: 1 })}
                options={batches.map((b) => ({ value: b.id, label: b.name }))}
              />
              <FilterSelect
                width="w-40"
                placeholder="Any fees"
                value={query.fees}
                onChange={(v) => setParams({ fees: v, page: 1 })}
                options={FEE_OPTIONS}
              />
              <FilterSelect
                width="w-44"
                placeholder="Any performance"
                value={query.performance}
                onChange={(v) => setParams({ performance: v, page: 1 })}
                options={PERFORMANCE_OPTIONS}
              />
              <FilterSelect
                width="w-40"
                placeholder="Verified?"
                value={query.verified}
                onChange={(v) => setParams({ verified: v, page: 1 })}
                options={[
                  { value: "yes", label: "Verified" },
                  { value: "no", label: "Not verified" },
                ]}
              />
              <FilterSelect
                width="w-44"
                placeholder="Profile filled?"
                value={query.profile}
                onChange={(v) => setParams({ profile: v, page: 1 })}
                options={[
                  { value: "yes", label: "Profile submitted" },
                  { value: "no", label: "Profile not filled" },
                ]}
              />
              <FilterSelect
                width="w-40"
                placeholder="Placement?"
                value={query.placed}
                onChange={(v) => setParams({ placed: v, page: 1 })}
                options={[
                  { value: "yes", label: "Placed" },
                  { value: "no", label: "Not placed" },
                ]}
              />
              <FilterSelect
                width="w-40"
                placeholder="Any progress"
                value={query.delayed}
                onChange={(v) => setParams({ delayed: v, page: 1 })}
                options={[{ value: "yes", label: "Falling behind" }]}
              />
              {hasFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() =>
                    setParams({
                      courseId: undefined,
                      batchId: undefined,
                      fees: undefined,
                      verified: undefined,
                      profile: undefined,
                      delayed: undefined,
                      performance: undefined,
                      placed: undefined,
                      role: undefined,
                      status: undefined,
                      page: 1,
                    })
                  }
                >
                  Clear filters
                </Button>
              )}
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
      <Dialog open={createOpen} onOpenChange={openCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>
              Create an account directly. It&apos;s pre-verified — the person
              can sign in with the password you set.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="c-name">Full name</Label>
              <Input
                id="c-name"
                value={createForm.name}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g. Priya Nair"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-email">Email</Label>
              <Input
                id="c-email"
                type="email"
                value={createForm.email}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, email: e.target.value }))
                }
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
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, password: e.target.value }))
                }
                placeholder="At least 8 characters"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select
                  value={createForm.roleSlug}
                  onValueChange={(v) =>
                    setCreateForm((f) => ({
                      ...f,
                      roleSlug: (v as Role) ?? ROLES.STUDENT,
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v) => (v ? ROLE_LABELS[v as Role] : "Select role")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={createForm.status}
                  onValueChange={(v) =>
                    setCreateForm((f) => ({ ...f, status: v ?? "ACTIVE" }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v) => (v ? cap(v) : "Status")}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {USER_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {cap(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {createError && (
              <div
                role="alert"
                className="border-destructive/30 bg-destructive/5 text-destructive flex items-start gap-2 rounded-lg border p-3 text-sm"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>{createError}</p>
              </div>
            )}
            {existingAccount && (
              <div
                role="alert"
                className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-500/40 dark:bg-amber-500/10"
              >
                <p>
                  <span className="font-medium">{createForm.email}</span>{" "}
                  already has an account —{" "}
                  <span className="font-medium">{existingAccount.name}</span> (
                  {existingAccount.roleLabel}
                  {existingAccount.extraRoles
                    .map((r) => `, ${r.label}`)
                    .join("")}
                  ).
                </p>
                {existingAccount.role === createForm.roleSlug ||
                existingAccount.extraRoles.some(
                  (r) => r.slug === createForm.roleSlug,
                ) ? (
                  <p className="text-muted-foreground">
                    They already have the {ROLE_LABELS[createForm.roleSlug]}{" "}
                    role.
                  </p>
                ) : (
                  <>
                    <p className="text-muted-foreground">
                      One person can hold more than one role. Give this account
                      the {ROLE_LABELS[createForm.roleSlug]} role as well —
                      their existing sign-in, courses and history stay as they
                      are.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      onClick={addRoleToExisting}
                      disabled={addingRole}
                    >
                      {addingRole ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <UserPlus className="size-4" />
                      )}
                      Add {ROLE_LABELS[createForm.roleSlug]} role to{" "}
                      {existingAccount.name}
                    </Button>
                  </>
                )}
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => openCreate(false)}
              >
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

      {/* Import users */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import users</DialogTitle>
            <DialogDescription>
              Upload a CSV with columns name, email, phone, role, password.{" "}
              <a
                href={IMPORT_TEMPLATE_HREF}
                className="text-primary font-medium hover:underline"
              >
                Download the template
              </a>
              . Accounts are pre-verified; anyone without a password signs in
              with an emailed code.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="import-file">CSV file</Label>
              <Input
                id="import-file"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => void onImportFile(e.target.files?.[0])}
              />
              {importFileName && (
                <p className="text-muted-foreground text-xs">
                  {importFileName} loaded.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="import-paste">…or paste the sheet</Label>
              <Textarea
                id="import-paste"
                rows={4}
                value={importCsv}
                onChange={(e) => {
                  setImportCsv(e.target.value);
                  setImportResult(null);
                }}
                placeholder={
                  "name,email,phone,role\nPriya Nair,priya@example.com,+91 98765 43210,Student"
                }
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role for rows without one</Label>
              <Select
                value={importRole}
                onValueChange={(v) =>
                  setImportRole((v as Role) ?? ROLES.STUDENT)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v) => (v ? ROLE_LABELS[v as Role] : "Select role")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={importAddRole}
                onCheckedChange={(v) => setImportAddRole(Boolean(v))}
              />
              If an email already has an account, add the row&apos;s role to it
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={importWelcome}
                onCheckedChange={(v) => setImportWelcome(Boolean(v))}
              />
              Send each new person a welcome email
            </label>
            {importResult && (
              <div className="space-y-2 rounded-lg border p-3 text-sm">
                <p className="font-medium">{importResult.message}</p>
                {importResult.errors.length > 0 && (
                  <ul className="text-muted-foreground max-h-40 space-y-1 overflow-auto text-xs">
                    {importResult.errors.map((e) => (
                      <li key={`${e.row}-${e.email}`}>
                        Row {e.row} · {e.email || "—"}: {e.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setImportOpen(false)}
            >
              Close
            </Button>
            <Button
              type="button"
              onClick={runImport}
              disabled={importing || !importCsv.trim()}
            >
              {importing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              Import
            </Button>
          </DialogFooter>
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
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-email">Email</Label>
              <Input
                id="e-email"
                type="email"
                value={editForm.email}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, email: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select
                  value={editForm.roleSlug}
                  onValueChange={(v) =>
                    setEditForm((f) => ({
                      ...f,
                      roleSlug: (v as Role) ?? ROLES.STUDENT,
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v) => (v ? ROLE_LABELS[v as Role] : "Select role")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={editForm.status}
                  onValueChange={(v) =>
                    setEditForm((f) => ({ ...f, status: v ?? "ACTIVE" }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v) => (v ? cap(v) : "Status")}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {USER_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {cap(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Also holds these roles</Label>
              <p className="text-muted-foreground text-xs">
                For someone who is, say, an instructor and also studying. They
                can switch panels from their menu.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {ROLE_OPTIONS.filter((r) => r !== editForm.roleSlug).map(
                  (r) => (
                    <label key={r} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={editForm.extraRoles.includes(r)}
                        onCheckedChange={(v) =>
                          setEditForm((f) => ({
                            ...f,
                            extraRoles: v
                              ? [...f.extraRoles, r]
                              : f.extraRoles.filter((x) => x !== r),
                          }))
                        }
                      />
                      {ROLE_LABELS[r]}
                    </label>
                  ),
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(null)}
              >
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

      <AlertDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
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

      <UserPermissionsDialog
        userId={permissionsFor}
        catalog={permissionCatalog}
        open={permissionsFor !== null}
        onOpenChange={(next) => !next && setPermissionsFor(null)}
      />
    </div>
  );
}
