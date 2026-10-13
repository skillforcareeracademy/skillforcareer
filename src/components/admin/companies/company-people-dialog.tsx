"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Copy,
  Loader2,
  LogIn,
  Search,
  ShieldCheck,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import type {
  CompanyPerson,
  CompanyRow,
} from "@/server/services/company-service";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { COMPANY_PERSON_ROLES } from "@/lib/validations/company";
import { ROLE_LABELS, type Role } from "@/config/roles";

const SEAT_LABEL: Record<string, string> = {
  STUDENT: "Learners",
  INSTRUCTOR: "Instructors",
  COMPANY_ADMIN: "Admins",
  SALES_AGENT: "Sales",
};

function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function PersonRow({
  person,
  action,
}: {
  person: CompanyPerson;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-2.5">
      <Avatar className="size-9 shrink-0">
        {person.avatarUrl && (
          <AvatarImage src={person.avatarUrl} alt={person.name} />
        )}
        <AvatarFallback className="bg-gradient-to-br from-rose-500 to-pink-600 text-xs font-semibold text-white">
          {initialsOf(person.name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{person.name}</p>
        <p className="text-muted-foreground truncate text-xs">{person.email}</p>
      </div>
      <Badge variant="outline" className="shrink-0">
        {person.roleLabel}
      </Badge>
      {action}
    </div>
  );
}

/**
 * Who belongs to a company, and how to put somebody there.
 *
 * A company with nobody in it is a company that does nothing, and until this
 * existed the only way in was to create an account and remember to pick the
 * company on the way — so every company started, and stayed, empty. People are
 * moved in from the academy's own accounts: the search only ever offers those,
 * because anyone already with a customer belongs to that customer.
 */
export function CompanyPeopleDialog({
  company,
  rootDomain,
  open,
  onOpenChange,
}: {
  company: CompanyRow;
  rootDomain: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState("in");
  const [people, setPeople] = useState<CompanyPerson[] | null>(null);
  const [candidates, setCandidates] = useState<CompanyPerson[] | null>(null);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [made, setMade] = useState<{ email: string; password: string } | null>(
    null,
  );
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    roleSlug: "COMPANY_ADMIN" as (typeof COMPANY_PERSON_ROLES)[number],
  });

  const loadPeople = useCallback(async () => {
    try {
      const res = await api.get<{ people: CompanyPerson[] }>(
        `/api/companies/${company.id}/people`,
      );
      setPeople(res.people);
    } catch (error) {
      setPeople([]);
      toast.error(
        error instanceof ApiError ? error.message : "Couldn't load its people.",
      );
    }
  }, [company.id]);

  const loadCandidates = useCallback(
    async (q: string) => {
      try {
        const res = await api.get<{ people: CompanyPerson[] }>(
          `/api/companies/${company.id}/people?available=1&q=${encodeURIComponent(q)}`,
        );
        setCandidates(res.people);
      } catch {
        setCandidates([]);
      }
    },
    [company.id],
  );

  useEffect(() => {
    if (!open) return;
    setTimeout(() => void loadPeople(), 0);
  }, [open, loadPeople]);

  // The search runs a moment after the typing stops rather than on every key:
  // the list is a database lookup, not a filter over something already loaded.
  useEffect(() => {
    if (!open || tab !== "add") return;
    const t = setTimeout(() => void loadCandidates(search), 250);
    return () => clearTimeout(t);
  }, [open, tab, search, loadCandidates]);

  // Personalised login — sign in as this person to see and run the company as
  // they do. The endpoint is the same "Secret login" used from Users, and it
  // alone decides who may do it: only a super admin may take over a company
  // admin. Nothing on the company's side records or is told of it.
  async function signInAs(person: CompanyPerson) {
    setBusy(`imp:${person.id}`);
    try {
      const res = await api.post<{ redirect?: string }>(
        `/api/admin/users/${person.id}/impersonate`,
        {},
      );
      toast.success(`Signed in as ${person.name}.`);
      window.location.href = res.redirect ?? "/admin";
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Couldn't sign in as this person.",
      );
      setBusy(null);
    }
  }

  async function add() {
    if (picked.length === 0) return;
    setBusy("add");
    try {
      const res = await api.post<{
        added: number;
        skipped: { name: string; reason: string }[];
        message: string;
      }>(`/api/companies/${company.id}/people`, { userIds: picked });
      if (res.added > 0) toast.success(res.message);
      for (const s of res.skipped) toast.error(`${s.name}: ${s.reason}`);
      setPicked([]);
      await loadPeople();
      await loadCandidates(search);
      if (res.added > 0) {
        setTab("in");
        router.refresh();
      }
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Couldn't add them.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    setBusy("create");
    try {
      const res = await api.post<{ id: string; message: string }>(
        `/api/companies/${company.id}/people/new`,
        form,
      );
      toast.success(res.message);
      setMade({ email: form.email, password: form.password });
      setForm({ name: "", email: "", password: "", roleSlug: form.roleSlug });
      await loadPeople();
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Couldn't make that account.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function remove(person: CompanyPerson) {
    setBusy(person.id);
    try {
      const res = await api.del<{ message: string }>(
        `/api/companies/${company.id}/people/${person.id}`,
      );
      toast.success(res.message);
      await loadPeople();
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Couldn't remove them.",
      );
    } finally {
      setBusy(null);
    }
  }

  const counted = people ?? [];
  const seatsNow = (role: string) =>
    counted.filter((p) => p.role === role).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{company.name}</DialogTitle>
          <DialogDescription>
            Everyone who belongs to this company, and the accounts you can move
            into it.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {Object.keys(SEAT_LABEL).map((role) => {
              const limit = company.limits[role as keyof typeof company.limits];
              const used = people
                ? seatsNow(role)
                : company.seats[role as keyof typeof company.seats];
              const full = limit != null && used >= limit;
              return (
                <span
                  key={role}
                  className={full ? "text-rose-600 dark:text-rose-400" : ""}
                >
                  {SEAT_LABEL[role]} {used}
                  {limit != null ? `/${limit}` : ""}
                </span>
              );
            })}
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
            <TabsList>
              <TabsTrigger value="in">
                <Users className="size-4" /> In this company
              </TabsTrigger>
              <TabsTrigger value="add">
                <UserPlus className="size-4" /> Move in
              </TabsTrigger>
              <TabsTrigger value="new">
                <ShieldCheck className="size-4" /> New account
              </TabsTrigger>
            </TabsList>

            <TabsContent value="in" className="space-y-2">
              {people === null && (
                <p className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
                  <Loader2 className="size-4 animate-spin" /> Loading…
                </p>
              )}
              {people?.length === 0 && (
                <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
                  Nobody is in this company yet. Use <b>Add people</b> to move
                  existing accounts in, or create an account under Users and
                  pick this company there.
                </p>
              )}
              {people?.map((p) => (
                <PersonRow
                  key={p.id}
                  person={p}
                  action={
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Sign in as ${p.name}`}
                        title={`Sign in as ${p.name}`}
                        disabled={busy === `imp:${p.id}`}
                        onClick={() => void signInAs(p)}
                      >
                        {busy === `imp:${p.id}` ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <LogIn className="size-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Open ${p.name}`}
                        title={`Open ${p.name}'s profile`}
                        render={<Link href={`/admin/users/${p.id}`} />}
                      >
                        <ArrowRight className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Take ${p.name} out`}
                        title={`Take ${p.name} out of the company`}
                        disabled={busy === p.id}
                        onClick={() => void remove(p)}
                      >
                        {busy === p.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <UserMinus className="size-4" />
                        )}
                      </Button>
                    </div>
                  }
                />
              ))}
              {people && people.length > 0 && (
                <p className="text-muted-foreground flex items-start gap-2 pt-1 text-xs">
                  <LogIn className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    Sign in as anyone here to see and run the company exactly as
                    they do — a banner reminds you, and one click returns you to
                    your own account.
                  </span>
                </p>
              )}
            </TabsContent>

            <TabsContent value="add" className="space-y-2">
              <div className="relative">
                <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or email"
                  className="pl-9"
                  autoComplete="off"
                />
              </div>
              {candidates === null && (
                <p className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
                  <Loader2 className="size-4 animate-spin" /> Loading…
                </p>
              )}
              {candidates?.length === 0 && (
                <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
                  No free account matches that. Only accounts that are not with
                  any company are offered here.
                </p>
              )}
              {candidates?.map((p) => {
                const on = picked.includes(p.id);
                return (
                  <PersonRow
                    key={p.id}
                    person={p}
                    action={
                      <Checkbox
                        className="shrink-0"
                        checked={on}
                        aria-label={`Pick ${p.name}`}
                        onCheckedChange={(next) =>
                          setPicked((prev) =>
                            next
                              ? [...prev, p.id]
                              : prev.filter((id) => id !== p.id),
                          )
                        }
                      />
                    }
                  />
                );
              })}
            </TabsContent>

            <TabsContent value="new" className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cp-name">Name</Label>
                  <Input
                    id="cp-name"
                    name="cp-name"
                    autoComplete="off"
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cp-role">Role in the company</Label>
                  <Select
                    value={form.roleSlug}
                    onValueChange={(v) =>
                      v &&
                      setForm((f) => ({
                        ...f,
                        roleSlug: String(
                          v,
                        ) as (typeof COMPANY_PERSON_ROLES)[number],
                      }))
                    }
                  >
                    <SelectTrigger id="cp-role" className="w-full">
                      <SelectValue>{(v) => ROLE_LABELS[v as Role]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {COMPANY_PERSON_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABELS[r as Role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cp-email">Email</Label>
                  <Input
                    id="cp-email"
                    name="cp-email"
                    type="email"
                    autoComplete="off"
                    value={form.email}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, email: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cp-password">Password to hand over</Label>
                  <Input
                    id="cp-password"
                    name="cp-password"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, password: e.target.value }))
                    }
                  />
                </div>
              </div>

              {made ? (
                <div className="space-y-2 rounded-lg border border-dashed p-3 text-xs">
                  <p className="font-medium">Hand these over</p>
                  <p className="text-muted-foreground">
                    They sign in at {`${rootDomain}/login`} with this email and
                    password — the same sign-in page as everyone else. From
                    there they see only this company.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="bg-muted truncate rounded px-2 py-1">
                      {made.email} · {made.password}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Copy the sign-in details"
                      onClick={() => {
                        void navigator.clipboard.writeText(
                          `${rootDomain}/login\n${made.email}\n${made.password}`,
                        );
                        toast.success("Copied.");
                      }}
                    >
                      <Copy className="size-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-xs">
                  A company admin made here signs in at {`${rootDomain}/login`},
                  like everybody else, and sees only this company — never the
                  academy and never another customer.
                </p>
              )}
            </TabsContent>
          </Tabs>
        </DialogBody>

        <DialogFooter>
          {tab === "new" ? (
            <Button
              onClick={() => void create()}
              disabled={
                busy === "create" ||
                form.name.trim().length < 2 ||
                !form.email.includes("@") ||
                form.password.length < 8
              }
            >
              {busy === "create" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UserPlus className="size-4" />
              )}
              Create the account
            </Button>
          ) : tab === "add" ? (
            <Button
              onClick={() => void add()}
              disabled={picked.length === 0 || busy === "add"}
            >
              {busy === "add" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Add {picked.length > 0 ? picked.length : ""}{" "}
              {picked.length === 1 ? "person" : "people"}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
