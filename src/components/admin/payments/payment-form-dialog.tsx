"use client";

import { useMemo, useState, type FormEvent } from "react";
import { format } from "date-fns";
import { Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import {
  INSTALLMENT_MODES,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  PAYMENT_PLANS,
  PAYMENT_PLAN_LABEL,
  PAYMENT_STATUS_CHOICES,
  PAYMENT_STATUS_LABEL,
  discountPercent,
  isEmiPlan,
  type InstallmentMode,
  type PaymentPlan,
} from "@/lib/validations/payment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SearchSelect } from "@/components/shared/search-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const NONE = "none";
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export interface PaymentFormOptions {
  users: { id: string; name: string; email: string }[];
  courses: { id: string; title: string }[];
  accounts: { id: string; name: string; autoReconcile: boolean }[];
}

/** One hand-written instalment row. */
interface ManualRow {
  amount: string;
  dueDate: string;
}

interface FormState {
  userId: string;
  courseId: string;
  amount: string;
  discountAmount: string;
  status: string;
  method: string;
  accountId: string;
  paidAt: string;
  couponCode: string;

  plan: PaymentPlan;
  interestPercent: string;
  installmentMode: InstallmentMode;
  installments: string;
  scheduleFrom: string;
  scheduleTo: string;
  manual: ManualRow[];

  graceDays: string;
  penaltyPercent: string;
  penaltyFlat: string;
  penaltyWaived: boolean;
  firstPaymentAt: string;
  lastPaymentAt: string;
  notes: string;
}

/** What a payment being edited looks like coming back from the detail route. */
export interface PaymentFormInitial {
  id: string;
  userId: string;
  courseId: string | null;
  amount: number;
  discountAmount: number;
  status: string;
  method: string | null;
  accountId?: string | null;
  paidAt: string | null;
  plan: PaymentPlan;
  interestPercent: number | null;
  installments: { amount: number; dueDate: string }[];
  graceDays: number | null;
  penaltyPercent: number | null;
  penaltyFlat: number | null;
  penaltyWaived: boolean;
  firstPaymentAt: string | null;
  lastPaymentAt: string | null;
  notes: string | null;
}

const BLANK: FormState = {
  userId: "",
  courseId: "",
  amount: "",
  discountAmount: "",
  status: "PAID",
  method: "UPI",
  accountId: "",
  paidAt: "",
  couponCode: "",
  plan: "ONE_TIME",
  interestPercent: "",
  installmentMode: "AUTO",
  installments: "3",
  scheduleFrom: "",
  scheduleTo: "",
  manual: [],
  graceDays: "",
  penaltyPercent: "",
  penaltyFlat: "",
  penaltyWaived: false,
  firstPaymentAt: "",
  lastPaymentAt: "",
  notes: "",
};

/** An ISO timestamp as the `datetime-local` box wants it, or "". */
function localValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : format(d, "yyyy-MM-dd'T'HH:mm");
}

function fromInitial(p: PaymentFormInitial): FormState {
  return {
    ...BLANK,
    userId: p.userId,
    courseId: p.courseId ?? "",
    amount: String(p.amount),
    discountAmount: p.discountAmount ? String(p.discountAmount) : "",
    status: p.status,
    method: p.method ?? "UPI",
    accountId: p.accountId ?? "",
    paidAt: localValue(p.paidAt),
    plan: p.plan,
    interestPercent: p.interestPercent != null ? String(p.interestPercent) : "",
    // A plan that already has dates opens on the hand-written tab, because that
    // is what its rows are now — re-deriving them would move dates the office
    // has already agreed with the learner.
    installmentMode: p.installments.length > 0 ? "MANUAL" : "AUTO",
    installments: String(Math.max(2, p.installments.length || 3)),
    manual: p.installments.map((i) => ({
      amount: String(i.amount),
      dueDate: localValue(i.dueDate),
    })),
    graceDays: p.graceDays != null ? String(p.graceDays) : "",
    penaltyPercent: p.penaltyPercent != null ? String(p.penaltyPercent) : "",
    penaltyFlat: p.penaltyFlat != null ? String(p.penaltyFlat) : "",
    penaltyWaived: p.penaltyWaived,
    firstPaymentAt: localValue(p.firstPaymentAt),
    lastPaymentAt: localValue(p.lastPaymentAt),
    notes: p.notes ?? "",
  };
}

/** A labelled box, since this form is almost nothing but labelled boxes. */
function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

/**
 * Recording a fee, and editing one that already exists.
 *
 * One dialog for both, because the office described them as one job: "bahar se
 * click krke field edit ka option and fees edit ka option". The three tabs are
 * the three questions it asks — what was paid, how it is being paid, and what
 * happens if it is late.
 */
export function PaymentFormDialog({
  open,
  onOpenChange,
  options,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: PaymentFormOptions;
  /** Null records a new payment; a payment edits that one. */
  initial?: PaymentFormInitial | null;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        {/* Mounted only while it is open, and keyed on what it is editing, so
            every set of boxes starts from its own payment rather than being
            reset into shape after the fact. */}
        {open && (
          <PaymentFormBody
            key={initial?.id ?? "new"}
            options={options}
            initial={initial ?? null}
            onClose={() => onOpenChange(false)}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PaymentFormBody({
  options,
  initial,
  onClose,
  onSaved,
}: {
  options: PaymentFormOptions;
  initial: PaymentFormInitial | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = initial != null;
  const [form, setForm] = useState<FormState>(() =>
    initial ? fromInitial(initial) : BLANK,
  );
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [coupon, setCoupon] = useState<{
    discount: number;
    code: string;
  } | null>(null);
  const [tab, setTab] = useState("payment");

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const total = Number(form.amount) || 0;
  const discount = Math.min(
    total,
    (Number(form.discountAmount) || 0) + (coupon?.discount ?? 0),
  );
  const net = Math.max(0, Math.round((total - discount) * 100) / 100);
  const percent = discountPercent(total, discount);
  const emi = isEmiPlan(form.plan);
  const scheduled = emi || form.plan === "BOOKING";

  /** What the learner will actually owe once interest is on. */
  const payable = useMemo(() => {
    if (form.plan !== "EMI_INTEREST") return net;
    const rate = Number(form.interestPercent) || 0;
    return Math.round(net * (1 + rate / 100) * 100) / 100;
  }, [net, form.plan, form.interestPercent]);

  /** Fill the hand-written rows from the automatic settings, to tweak by hand. */
  function spreadIntoRows() {
    const count = Math.max(2, Number(form.installments) || 2);
    const from = form.scheduleFrom ? new Date(form.scheduleFrom) : null;
    if (!from || Number.isNaN(from.getTime())) {
      toast.error("Give the first instalment a date first.");
      return;
    }
    const to = form.scheduleTo ? new Date(form.scheduleTo) : null;
    const span =
      to && !Number.isNaN(to.getTime()) && count > 1
        ? (to.getTime() - from.getTime()) / (count - 1)
        : null;
    const per = Math.floor((payable / count) * 100) / 100;

    const rows: ManualRow[] = Array.from({ length: count }, (_, i) => {
      let due: Date;
      if (span != null && span > 0) {
        due = new Date(from.getTime() + span * i);
      } else {
        due = new Date(from);
        due.setMonth(due.getMonth() + i);
      }
      const amount =
        i === count - 1
          ? Math.round((payable - per * (count - 1)) * 100) / 100
          : per;
      return {
        amount: String(amount),
        dueDate: format(due, "yyyy-MM-dd'T'HH:mm"),
      };
    });
    setForm((prev) => ({ ...prev, manual: rows, installmentMode: "MANUAL" }));
  }

  const manualTotal = form.manual.reduce(
    (s, r) => s + (Number(r.amount) || 0),
    0,
  );

  async function applyCoupon() {
    if (!form.couponCode.trim() || total < 1) {
      toast.error("Enter an amount and a coupon code.");
      return;
    }
    setApplying(true);
    try {
      const r = await api.post<{
        valid: boolean;
        reason?: string;
        discount?: number;
        code?: string;
      }>("/api/coupons/validate", {
        code: form.couponCode,
        amount: total,
        courseId: form.courseId || undefined,
      });
      if (!r.valid) {
        setCoupon(null);
        toast.error(r.reason ?? "Invalid coupon.");
      } else {
        setCoupon({
          discount: r.discount ?? 0,
          code: r.code ?? form.couponCode,
        });
        toast.success(`Coupon applied — ${inr(r.discount ?? 0)} off.`);
      }
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Couldn't validate coupon.",
      );
    } finally {
      setApplying(false);
    }
  }

  /** The bits both recording and editing send. */
  function payload() {
    const blankToUndefined = (v: string) => (v.trim() === "" ? undefined : v);
    const numberOr = (v: string) => (v.trim() === "" ? undefined : Number(v));

    return {
      courseId: form.courseId || "",
      amount: total,
      discountAmount: Number(form.discountAmount) || 0,
      status: form.status,
      method: form.method,
      accountId: form.accountId || "",
      paidAt:
        form.status === "PAID" ? blankToUndefined(form.paidAt) : undefined,
      plan: form.plan,
      interestPercent:
        form.plan === "EMI_INTEREST"
          ? numberOr(form.interestPercent)
          : undefined,
      installmentMode: scheduled ? form.installmentMode : undefined,
      installments:
        scheduled && form.installmentMode === "AUTO"
          ? Number(form.installments)
          : undefined,
      scheduleFrom: scheduled ? blankToUndefined(form.scheduleFrom) : undefined,
      scheduleTo: scheduled ? blankToUndefined(form.scheduleTo) : undefined,
      schedule:
        scheduled && form.installmentMode === "MANUAL"
          ? form.manual
              .filter((r) => r.dueDate)
              .map((r) => ({
                amount: Number(r.amount) || 0,
                dueDate: r.dueDate,
              }))
          : undefined,
      graceDays: numberOr(form.graceDays),
      penaltyPercent: numberOr(form.penaltyPercent),
      penaltyFlat: numberOr(form.penaltyFlat),
      penaltyWaived: form.penaltyWaived,
      firstPaymentAt: form.firstPaymentAt,
      lastPaymentAt: form.lastPaymentAt,
      notes: form.notes,
    };
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/api/payments/${initial.id}`, payload());
        toast.success("Payment saved.");
      } else {
        await api.post("/api/payments", {
          ...payload(),
          userId: form.userId,
          provider: form.method === "ONLINE" ? "RAZORPAY" : "MANUAL",
          couponCode: coupon ? coupon.code : undefined,
        });
        toast.success("Payment recorded.");
      }
      onClose();
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        const d = err.details as { issues?: { message: string }[] } | undefined;
        toast.error(d?.issues?.[0]?.message ?? err.message);
      } else {
        toast.error(
          editing ? "Couldn't save that." : "Couldn't record payment.",
        );
      }
    } finally {
      setSaving(false);
    }
  }

  const canSave = Boolean((editing || form.userId) && total >= 1);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? "Edit payment" : "Record payment"}</DialogTitle>
        <DialogDescription>
          {editing
            ? "Change the amount, the plan or the terms. The learner's status follows whatever is still owed."
            : "Log a payment for a learner — one off, a booking amount, or a plan paid in instalments."}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={onSubmit} className="space-y-4">
        <Tabs value={tab} onValueChange={(v) => v && setTab(v)}>
          <TabsList className="w-full">
            <TabsTrigger value="payment">Payment</TabsTrigger>
            <TabsTrigger value="plan">Plan</TabsTrigger>
            <TabsTrigger value="terms">Late fees</TabsTrigger>
          </TabsList>

          {/* ── What was paid ─────────────────────────────────────────── */}
          <TabsContent value="payment" className="mt-4 space-y-4">
            {!editing && (
              <Field label="Learner">
                <SearchSelect
                  ariaLabel="Learner"
                  options={options.users.map((u) => ({
                    id: u.id,
                    label: u.name,
                    hint: u.email,
                  }))}
                  value={form.userId || null}
                  onChange={(id) => set("userId", id ?? "")}
                  placeholder="Search for a learner…"
                  searchPlaceholder="Search by name or email…"
                  emptyLabel="No learner matches that."
                />
              </Field>
            )}

            <Field label="Course (optional)">
              <SearchSelect
                ariaLabel="Course"
                options={options.courses.map((c) => ({
                  id: c.id,
                  label: c.title,
                }))}
                value={form.courseId || null}
                onChange={(id) => set("courseId", id ?? "")}
                placeholder="Search for a course…"
                clearLabel="None"
                searchPlaceholder="Search courses…"
                emptyLabel="No course matches that."
              />
            </Field>

            {/* The office asked for both figures and the percentage between
                  them: "Total Amount / Discounted amount / Auto calculated how
                  much percentage of discount given." */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Total amount (₹)" htmlFor="pay-total">
                <Input
                  id="pay-total"
                  type="number"
                  min={0}
                  value={form.amount}
                  onChange={(e) => set("amount", e.target.value)}
                  placeholder="e.g. 49999"
                />
              </Field>
              <Field label="Discount (₹)" htmlFor="pay-discount">
                <Input
                  id="pay-discount"
                  type="number"
                  min={0}
                  value={form.discountAmount}
                  onChange={(e) => set("discountAmount", e.target.value)}
                  placeholder="0"
                />
              </Field>
            </div>

            <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                {discount > 0 ? `${percent}% off` : "No discount"}
              </span>
              <span className="font-medium tabular-nums">
                Net payable {inr(payable)}
                {payable !== net && (
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    (incl. interest)
                  </span>
                )}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Status">
                <Select
                  value={form.status}
                  onValueChange={(v) => v && set("status", v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v) => PAYMENT_STATUS_LABEL[String(v)] ?? String(v)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_STATUS_CHOICES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {PAYMENT_STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Payment method">
                <Select
                  value={form.method}
                  onValueChange={(v) => v && set("method", v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v) => PAYMENT_METHOD_LABEL[String(v)]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {PAYMENT_METHOD_LABEL[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label="Received in">
              <Select
                value={form.accountId || NONE}
                onValueChange={(v) =>
                  set("accountId", v === NONE ? "" : (v ?? ""))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v) =>
                      !v || v === NONE
                        ? "Not specified"
                        : (options.accounts.find((a) => a.id === v)?.name ??
                          "Not specified")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not specified</SelectItem>
                  {options.accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                      {a.autoReconcile ? " · auto" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {form.status === "PAID" && (
              <Field
                label="Payment date & time"
                htmlFor="pay-date"
                hint="Leave blank to use the current time."
              >
                <Input
                  id="pay-date"
                  type="datetime-local"
                  value={form.paidAt}
                  onChange={(e) => set("paidAt", e.target.value)}
                />
              </Field>
            )}

            {!editing && (
              <Field label="Coupon (optional)" htmlFor="pay-coupon">
                <div className="flex gap-2">
                  <Input
                    id="pay-coupon"
                    value={form.couponCode}
                    onChange={(e) => {
                      set("couponCode", e.target.value.toUpperCase());
                      setCoupon(null);
                    }}
                    placeholder="Code"
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={applyCoupon}
                    disabled={applying || !form.couponCode.trim()}
                  >
                    {applying ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      "Apply"
                    )}
                  </Button>
                </div>
                {coupon && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">
                    −{inr(coupon.discount)} applied on top of the discount
                    above.
                  </p>
                )}
              </Field>
            )}
          </TabsContent>

          {/* ── How it is being paid ───────────────────────────────────── */}
          <TabsContent value="plan" className="mt-4 space-y-4">
            <Field label="Payment type">
              <Select
                value={form.plan}
                onValueChange={(v) => v && set("plan", v as PaymentPlan)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v) => PAYMENT_PLAN_LABEL[v as PaymentPlan] ?? String(v)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_PLANS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PAYMENT_PLAN_LABEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {form.plan === "EMI_INTEREST" && (
              <Field
                label="Interest (%)"
                htmlFor="pay-interest"
                hint="Added on top of the net amount. Blank uses the platform rate."
              >
                <Input
                  id="pay-interest"
                  type="number"
                  min={0}
                  max={60}
                  step="0.5"
                  value={form.interestPercent}
                  onChange={(e) => set("interestPercent", e.target.value)}
                  placeholder="platform default"
                />
              </Field>
            )}

            {!scheduled ? (
              <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
                A one-off payment has no schedule. Choose a booking amount or an
                EMI plan to set instalment dates.
              </p>
            ) : (
              <>
                <Field
                  label="Instalments"
                  hint="Work them out from a date range, or write each date and amount yourself."
                >
                  <div className="flex gap-2">
                    {INSTALLMENT_MODES.map((m) => (
                      <Button
                        key={m}
                        type="button"
                        size="sm"
                        variant={
                          form.installmentMode === m ? "default" : "outline"
                        }
                        onClick={() => set("installmentMode", m)}
                      >
                        {m === "AUTO"
                          ? "Calculate automatically"
                          : "Add manually"}
                      </Button>
                    ))}
                  </div>
                </Field>

                {form.installmentMode === "AUTO" ? (
                  <div className="space-y-4 rounded-lg border p-3">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field label="How many" htmlFor="pay-count">
                        <Input
                          id="pay-count"
                          type="number"
                          min={2}
                          max={36}
                          value={form.installments}
                          onChange={(e) => set("installments", e.target.value)}
                        />
                      </Field>
                      <Field label="First due" htmlFor="pay-from">
                        <Input
                          id="pay-from"
                          type="datetime-local"
                          value={form.scheduleFrom}
                          onChange={(e) => set("scheduleFrom", e.target.value)}
                        />
                      </Field>
                      <Field label="Last due (optional)" htmlFor="pay-to">
                        <Input
                          id="pay-to"
                          type="datetime-local"
                          value={form.scheduleTo}
                          onChange={(e) => set("scheduleTo", e.target.value)}
                        />
                      </Field>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {inr(payable)} across {form.installments || 0}{" "}
                      instalments. Leaving the last date blank spaces them a
                      month apart.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={spreadIntoRows}
                    >
                      <Wand2 className="size-4" /> Work them out and edit by
                      hand
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2 rounded-lg border p-3">
                    {form.manual.length === 0 && (
                      <p className="text-muted-foreground text-sm">
                        No instalments yet. Add one, or switch to
                        &ldquo;calculate automatically&rdquo;.
                      </p>
                    )}
                    {form.manual.map((row, i) => (
                      <div key={i} className="flex flex-wrap items-end gap-2">
                        <div className="min-w-40 flex-1 basis-48 space-y-1">
                          <Label className="text-xs">Due on</Label>
                          <Input
                            type="datetime-local"
                            value={row.dueDate}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                manual: prev.manual.map((r, j) =>
                                  j === i
                                    ? { ...r, dueDate: e.target.value }
                                    : r,
                                ),
                              }))
                            }
                          />
                        </div>
                        <div className="w-28 space-y-1">
                          <Label className="text-xs">Amount (₹)</Label>
                          <Input
                            type="number"
                            min={0}
                            value={row.amount}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                manual: prev.manual.map((r, j) =>
                                  j === i
                                    ? { ...r, amount: e.target.value }
                                    : r,
                                ),
                              }))
                            }
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove instalment ${i + 1}`}
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              manual: prev.manual.filter((_, j) => j !== i),
                            }))
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            manual: [
                              ...prev.manual,
                              { amount: "", dueDate: "" },
                            ],
                          }))
                        }
                      >
                        <Plus className="size-4" /> Add instalment
                      </Button>
                      <span
                        className={
                          Math.abs(manualTotal - payable) > 1
                            ? "text-sm font-medium text-amber-600 dark:text-amber-400"
                            : "text-muted-foreground text-sm"
                        }
                      >
                        {inr(manualTotal)} of {inr(payable)}
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* The ends of the trail. Filled in from what has actually been
                  paid, and overridable — "we can change it manually also". */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="First payment date"
                htmlFor="pay-first"
                hint="Blank follows the payment trail."
              >
                <Input
                  id="pay-first"
                  type="datetime-local"
                  value={form.firstPaymentAt}
                  onChange={(e) => set("firstPaymentAt", e.target.value)}
                />
              </Field>
              <Field
                label="Last payment date"
                htmlFor="pay-last"
                hint="Blank follows the payment trail."
              >
                <Input
                  id="pay-last"
                  type="datetime-local"
                  value={form.lastPaymentAt}
                  onChange={(e) => set("lastPaymentAt", e.target.value)}
                />
              </Field>
            </div>
          </TabsContent>

          {/* ── What happens when it is late ───────────────────────────── */}
          <TabsContent value="terms" className="mt-4 space-y-4">
            <p className="text-muted-foreground text-sm">
              Leave a box empty to use the academy&apos;s own terms, set under
              Settings → Fees.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Grace period (days)"
                htmlFor="pay-grace"
                hint="Days after the due date before a late fee applies."
              >
                <Input
                  id="pay-grace"
                  type="number"
                  min={0}
                  max={90}
                  value={form.graceDays}
                  onChange={(e) => set("graceDays", e.target.value)}
                  placeholder="default"
                />
              </Field>
              <Field label="Penalty (%)" htmlFor="pay-penalty">
                <Input
                  id="pay-penalty"
                  type="number"
                  min={0}
                  max={100}
                  step="0.5"
                  value={form.penaltyPercent}
                  onChange={(e) => set("penaltyPercent", e.target.value)}
                  placeholder="default"
                />
              </Field>
              <Field
                label="…or flat (₹)"
                htmlFor="pay-penalty-flat"
                hint="Used instead of the percentage."
              >
                <Input
                  id="pay-penalty-flat"
                  type="number"
                  min={0}
                  value={form.penaltyFlat}
                  onChange={(e) => set("penaltyFlat", e.target.value)}
                  placeholder="default"
                />
              </Field>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Waive all late fees</p>
                <p className="text-muted-foreground text-xs">
                  Forgives everything already charged on this plan, and stops
                  anything further.
                </p>
              </div>
              <Switch
                checked={form.penaltyWaived}
                onCheckedChange={(v) => set("penaltyWaived", v)}
                aria-label="Waive all late fees"
              />
            </div>

            <Field label="Notes" hint="Only the office sees these.">
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="What was agreed, and with whom."
              />
            </Field>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSave || saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {editing ? "Save changes" : "Record"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
