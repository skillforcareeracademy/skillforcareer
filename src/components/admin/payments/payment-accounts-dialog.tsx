"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Trash2, Zap, Hand, X } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import {
  PAYMENT_ACCOUNT_KINDS,
  PAYMENT_ACCOUNT_KIND_LABEL,
} from "@/lib/validations/payment";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Account {
  id: string;
  name: string;
  kind: string;
  identifier: string | null;
  autoReconcile: boolean;
  isActive: boolean;
  notes: string | null;
  paymentCount: number;
}

interface FormState {
  name: string;
  kind: string;
  identifier: string;
  isActive: boolean;
  notes: string;
}
const EMPTY: FormState = { name: "", kind: "UPI_QR", identifier: "", isActive: true, notes: "" };

export function PaymentAccountsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && <AccountsBody onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function AccountsBody({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [editing, setEditing] = useState<Account | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.get<{ accounts: Account[] }>("/api/payment-accounts");
      setAccounts(d.accounts);
    } catch {
      setAccounts([]);
    }
  }, []);

  // Mounts fresh each time the dialog opens (gated by the parent), so the load
  // runs once on mount — state setting stays inside the async callback.
  useEffect(() => {
    let alive = true;
    api
      .get<{ accounts: Account[] }>("/api/payment-accounts")
      .then((d) => alive && setAccounts(d.accounts))
      .catch(() => alive && setAccounts([]));
    return () => {
      alive = false;
    };
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setShowForm(true);
  }
  function openEdit(a: Account) {
    setEditing(a);
    setForm({
      name: a.name,
      kind: a.kind,
      identifier: a.identifier ?? "",
      isActive: a.isActive,
      notes: a.notes ?? "",
    });
    setShowForm(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name: form.name,
      kind: form.kind,
      identifier: form.identifier || undefined,
      isActive: form.isActive,
      notes: form.notes || undefined,
    };
    try {
      if (editing) await api.patch(`/api/payment-accounts/${editing.id}`, payload);
      else await api.post("/api/payment-accounts", payload);
      toast.success(editing ? "Account saved." : "Account added.");
      setShowForm(false);
      await load();
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const d = err.details as { issues?: { message: string }[] } | undefined;
        toast.error(d?.issues?.[0]?.message ?? err.message);
      } else toast.error("Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(a: Account) {
    try {
      await api.del(`/api/payment-accounts/${a.id}`);
      toast.success("Account deleted.");
      await load();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
    }
  }

  const autoKind = form.kind === "RAZORPAY";

  return (
    <>
      <DialogHeader>
        <DialogTitle>Payment accounts</DialogTitle>
        <DialogDescription>
          Where money is collected. Razorpay reconciles automatically; QR/UPI, bank
          and cash are marked by hand when you record a payment.
        </DialogDescription>
      </DialogHeader>

        {showForm ? (
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="acc-name">Account name</Label>
              <Input
                id="acc-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Razorpay Official / Owner GPay"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.kind} onValueChange={(v) => v && setForm((f) => ({ ...f, kind: v }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v) => PAYMENT_ACCOUNT_KIND_LABEL[String(v)]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_ACCOUNT_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {PAYMENT_ACCOUNT_KIND_LABEL[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="acc-id">UPI id / reference</Label>
                <Input
                  id="acc-id"
                  value={form.identifier}
                  onChange={(e) => setForm((f) => ({ ...f, identifier: e.target.value }))}
                  placeholder="e.g. owner@upi"
                />
              </div>
            </div>
            <p
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs",
                autoKind
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {autoKind ? <Zap className="size-3.5" /> : <Hand className="size-3.5" />}
              {autoKind
                ? "Payments to this account update automatically via the Razorpay webhook."
                : "Payments to this account are recorded and marked paid manually."}
            </p>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-muted-foreground text-xs">Inactive accounts are hidden from the picker.</p>
              </div>
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                Back
              </Button>
              <Button type="submit" disabled={form.name.trim().length < 2 || saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                {editing ? "Save account" : "Add account"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-3">
            {!accounts ? (
              <Skeleton className="h-24 w-full rounded-lg" />
            ) : accounts.length === 0 ? (
              <div className="rounded-xl border border-dashed py-8 text-center">
                <p className="text-sm font-medium">No accounts yet</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Add your Razorpay account and any QR/UPI or cash channels.
                </p>
              </div>
            ) : (
              <ul className="divide-y rounded-xl border">
                {accounts.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">{a.name}</p>
                        {!a.isActive && (
                          <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
                        )}
                      </div>
                      <p className="text-muted-foreground truncate text-xs">
                        {PAYMENT_ACCOUNT_KIND_LABEL[a.kind] ?? a.kind}
                        {a.identifier ? ` · ${a.identifier}` : ""}
                        {a.paymentCount > 0 ? ` · ${a.paymentCount} payments` : ""}
                      </p>
                    </div>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "shrink-0 gap-1",
                        a.autoReconcile
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                          : "text-muted-foreground",
                      )}
                    >
                      {a.autoReconcile ? <Zap className="size-3" /> : <Hand className="size-3" />}
                      {a.autoReconcile ? "Auto" : "Manual"}
                    </Badge>
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${a.name}`} onClick={() => openEdit(a)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${a.name}`}
                      className="text-destructive"
                      onClick={() => remove(a)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={onClose}>
                <X className="size-4" /> Close
              </Button>
              <Button type="button" onClick={openCreate}>
                <Plus className="size-4" /> Add account
              </Button>
            </div>
          </div>
        )}
    </>
  );
}
