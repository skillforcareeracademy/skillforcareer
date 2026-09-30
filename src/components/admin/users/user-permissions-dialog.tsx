"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import type { PermissionGroup } from "@/server/services/role-service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface View {
  user: { id: string; name: string; email: string; roleName: string };
  fromRole: string[];
  overrides: { key: string; allow: boolean }[];
}

/**
 * What one person may do, over and above their role.
 *
 * "Individual user based permissions bhi dene ka option hona chahiye. Jaise
 * shagun sales agent hai to mai sabhi sales agent ko lead upload karne ka nhi
 * de skta. Sirf shagun ko dena hai."
 *
 * Each row says where its state comes from — the role, or this person — so an
 * admin can see at a glance what they have changed and what they have merely
 * inherited. Unticking something the role grants records a revoke for this
 * person alone; their colleagues keep it.
 */
export function UserPermissionsDialog({
  userId,
  catalog,
  open,
  onOpenChange,
}: {
  userId: string | null;
  catalog: PermissionGroup[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [view, setView] = useState<View | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // Derived rather than held in state: "loaded" has to mean "loaded for *this*
  // person", or opening the dialog on someone else would show the previous
  // person's ticks for a moment. It also keeps the effect free of the
  // synchronous setState the compiler rejects.
  const loaded = view !== null && view.user.id === userId;
  const loading = open && userId !== null && !loaded;

  useEffect(() => {
    if (!open || !userId) return;
    let alive = true;
    api
      .get<View>(`/api/admin/users/${userId}/permissions`)
      .then((data) => {
        if (!alive) return;
        setView(data);
        // What they can do right now: the role's list, plus grants, minus
        // revokes — the same arithmetic the server does when they sign in.
        const next = new Set(data.fromRole);
        for (const o of data.overrides) {
          if (o.allow) next.add(o.key);
          else next.delete(o.key);
        }
        setChecked(next);
      })
      .catch((err) =>
        toast.error(
          err instanceof ApiError ? err.message : "Couldn't load permissions.",
        ),
      );
    return () => {
      alive = false;
    };
  }, [open, userId]);

  function toggle(key: string, on: boolean) {
    setChecked((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function save() {
    if (!userId || !view || !loaded) return;
    const fromRole = new Set(view.fromRole);
    // Only the differences travel: everything else stays the role's business,
    // so a later change to the role still reaches this person.
    const overrides: { key: string; allow: boolean }[] = [];
    for (const group of catalog) {
      for (const item of group.items) {
        const has = checked.has(item.key);
        if (has !== fromRole.has(item.key)) {
          overrides.push({ key: item.key, allow: has });
        }
      }
    }

    setSaving(true);
    try {
      await api.patch(`/api/admin/users/${userId}/permissions`, { overrides });
      toast.success(
        overrides.length
          ? `Saved ${overrides.length} change${overrides.length === 1 ? "" : "s"} for ${view.user.name}.`
          : `${view.user.name} now follows their role exactly.`,
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Couldn't save permissions.",
      );
    } finally {
      setSaving(false);
    }
  }

  const fromRole = new Set(loaded ? (view?.fromRole ?? []) : []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {loaded && view ? `Permissions for ${view.user.name}` : "Permissions"}
          </DialogTitle>
          <DialogDescription>
            {loaded && view ? (
              <>
                On top of the <strong>{view.user.roleName}</strong> role. Ticking
                something extra gives it to {view.user.name} alone; unticking
                something the role grants takes it from them alone.
              </>
            ) : (
              "Loading…"
            )}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          {loading && (
            <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
              <Loader2 className="size-4 animate-spin" /> Loading permissions…
            </div>
          )}

          {loaded &&
            view &&
            catalog.map((group) => (
              <div key={group.group} className="space-y-2">
                <p className="text-sm font-medium">{group.group}</p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {group.items.map((item) => {
                    const on = checked.has(item.key);
                    const inherited = fromRole.has(item.key);
                    return (
                      <label
                        key={item.key}
                        className="hover:bg-muted/60 flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5"
                      >
                        <Checkbox
                          className="mt-0.5"
                          checked={on}
                          onCheckedChange={(next) => toggle(item.key, !!next)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm">{item.description}</span>
                            {on && !inherited && (
                              <Badge variant="secondary" className="text-[10px]">
                                added
                              </Badge>
                            )}
                            {!on && inherited && (
                              <Badge variant="outline" className="text-[10px]">
                                removed
                              </Badge>
                            )}
                          </span>
                          <span className="text-muted-foreground block font-mono text-[11px]">
                            {item.key}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !loaded}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ShieldCheck className="size-4" />
            )}
            Save permissions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
