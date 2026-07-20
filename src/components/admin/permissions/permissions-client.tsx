"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  KeyRound,
  Plus,
  Users,
  Lock,
  Loader2,
  Trash2,
  ShieldCheck,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import type { RoleRow, PermissionGroup } from "@/server/services/role-service";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { cn } from "@/lib/utils";

const PROTECTED = "SUPER_ADMIN"; // its permissions can't be edited (avoid lock-out)

export function PermissionsClient({
  roles,
  catalog,
}: {
  roles: RoleRow[];
  catalog: PermissionGroup[];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(roles[0]?.id ?? "");
  const [draft, setDraft] = useState<Set<string>>(() => new Set(roles[0]?.permissionKeys ?? []));
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newRole, setNewRole] = useState({ name: "", description: "" });
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<RoleRow | null>(null);

  const selected = roles.find((r) => r.id === selectedId) ?? roles[0];
  const locked = selected?.slug === PROTECTED;
  const totalPerms = catalog.reduce((n, g) => n + g.items.length, 0);

  const dirty = useMemo(() => {
    if (!selected) return false;
    const cur = new Set(selected.permissionKeys);
    if (cur.size !== draft.size) return true;
    for (const k of draft) if (!cur.has(k)) return true;
    return false;
  }, [selected, draft]);

  function selectRole(r: RoleRow) {
    setSelectedId(r.id);
    setDraft(new Set(r.permissionKeys));
  }
  function toggle(key: string) {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function toggleGroup(g: PermissionGroup, on: boolean) {
    setDraft((prev) => {
      const next = new Set(prev);
      for (const it of g.items) {
        if (on) next.add(it.key);
        else next.delete(it.key);
      }
      return next;
    });
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      await api.patch(`/api/roles/${selected.id}/permissions`, { keys: [...draft] });
      toast.success("Permissions saved.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post("/api/roles", { name: newRole.name, description: newRole.description || undefined });
      toast.success("Role created.");
      setCreateOpen(false);
      setNewRole({ name: "", description: "" });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't create role.");
    } finally {
      setCreating(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.del(`/api/roles/${deleting.id}`);
      toast.success("Role deleted.");
      if (selectedId === deleting.id && roles[0]) selectRole(roles[0]);
      setDeleting(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles & permissions"
        description="Control what each role can do across the platform."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> New role
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Roles list */}
        <div className="space-y-2">
          {roles.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => selectRole(r)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                r.id === selectedId ? "border-primary bg-primary/5" : "hover:border-primary/40",
              )}
            >
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", r.id === selectedId ? "bg-primary text-primary-foreground" : "bg-muted")}>
                {r.slug === PROTECTED ? <ShieldCheck className="size-4" /> : <KeyRound className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.name}</p>
                <p className="text-muted-foreground flex items-center gap-1 text-xs">
                  <Users className="size-3" /> {r.users} · {r.permissionKeys.length} perms
                </p>
              </div>
              {r.isSystem && <Badge variant="secondary" className="text-[10px]">Built-in</Badge>}
            </button>
          ))}
        </div>

        {/* Permission editor */}
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                {selected?.name}
                {locked && <Lock className="text-muted-foreground size-4" />}
              </CardTitle>
              <CardDescription>
                {locked
                  ? "The Super Admin always has full access — not editable."
                  : `${draft.size} of ${totalPerms} permissions granted`}
              </CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {selected && !selected.isSystem && (
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleting(selected)}>
                  <Trash2 className="size-4" /> Delete
                </Button>
              )}
              <Button size="sm" onClick={save} disabled={!dirty || saving || locked}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {catalog.map((g) => {
              const granted = g.items.filter((it) => draft.has(it.key)).length;
              const allOn = granted === g.items.length;
              return (
                <div key={g.group}>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold">{g.group}</p>
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => toggleGroup(g, !allOn)}
                      className="text-muted-foreground hover:text-foreground text-xs disabled:opacity-50"
                    >
                      {allOn ? "Clear all" : "Select all"}
                    </button>
                  </div>
                  <div className="divide-y rounded-lg border">
                    {g.items.map((it) => (
                      <div key={it.key} className="flex items-center justify-between gap-3 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm capitalize">{it.description}</p>
                          <p className="text-muted-foreground font-mono text-[11px]">{it.key}</p>
                        </div>
                        <Switch
                          checked={locked ? true : draft.has(it.key)}
                          onCheckedChange={() => toggle(it.key)}
                          disabled={locked}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Create role */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New role</DialogTitle>
            <DialogDescription>Create a custom role, then assign permissions.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="r-name">Role name</Label>
              <Input id="r-name" value={newRole.name} onChange={(e) => setNewRole((r) => ({ ...r, name: e.target.value }))} placeholder="e.g. Content Manager" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-desc">Description (optional)</Label>
              <Input id="r-desc" value={newRole.description} onChange={(e) => setNewRole((r) => ({ ...r, description: e.target.value }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={creating || newRole.name.trim().length < 2}>
                {creating && <Loader2 className="size-4 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting != null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete role {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This role must have no assigned users. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
