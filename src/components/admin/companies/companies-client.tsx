"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Building2,
  Crown,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import {
  COMPANY_STATUS_LABEL,
  type CompanyStatus,
} from "@/lib/validations/company";
import type { CompanyRow } from "@/server/services/company-service";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { CompanyFormDialog } from "./company-form-dialog";

const SEAT_LABEL: Record<string, string> = {
  STUDENT: "Learners",
  INSTRUCTOR: "Instructors",
  COMPANY_ADMIN: "Admins",
  SALES_AGENT: "Sales",
};

/**
 * The tenants the platform is sold to.
 *
 * The academy's own row leads the list and is marked as the owner: it has no
 * seat limit, no subscription and cannot be suspended or removed — it is the
 * platform, not a customer of it.
 */
export function CompaniesClient({
  companies,
  rootDomain,
}: {
  companies: CompanyRow[];
  rootDomain: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<CompanyRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<CompanyRow | null>(null);
  const [busy, setBusy] = useState(false);

  const customers = companies.filter((c) => !c.isOwner);

  async function remove() {
    if (!removing) return;
    setBusy(true);
    try {
      const res = await api.del<{ message: string }>(
        `/api/companies/${removing.id}`,
      );
      toast.success(res.message);
      setRemoving(null);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Couldn't remove that.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Companies"
        description="Organisations training their own people on the platform. Each sees only itself."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" /> Add a company
          </Button>
        }
      />

      <div className="space-y-3">
        {companies.map((c) => (
          <Card key={c.id}>
            <CardContent className="flex flex-wrap items-start justify-between gap-4 pt-6">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {c.isOwner ? (
                    <Crown className="size-4 text-amber-500" />
                  ) : (
                    <Building2 className="text-muted-foreground size-4" />
                  )}
                  <span className="font-medium">{c.name}</span>
                  {c.isOwner ? (
                    <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                      The academy
                    </Badge>
                  ) : (
                    <Badge
                      variant="secondary"
                      className={
                        c.status === "SUSPENDED"
                          ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                      }
                    >
                      {COMPANY_STATUS_LABEL[c.status as CompanyStatus] ?? c.status}
                    </Badge>
                  )}
                  {c.plan && <Badge variant="outline">{c.plan}</Badge>}
                </div>

                <p className="text-muted-foreground mt-1 text-xs">
                  {[
                    c.contactName,
                    c.email,
                    c.phone,
                    c.subscriptionEndsAt
                      ? `Renews ${format(new Date(c.subscriptionEndsAt), "d MMM yyyy")}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "No contact details yet"}
                </p>

                <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="flex items-center gap-1">
                    <Users className="size-3.5" /> {c.users}{" "}
                    {c.users === 1 ? "account" : "accounts"}
                  </span>
                  {!c.isOwner &&
                    Object.entries(c.seats).map(([role, used]) => {
                      const limit = c.limits[role as keyof typeof c.limits];
                      const full = limit != null && used >= limit;
                      return (
                        <span
                          key={role}
                          className={full ? "text-rose-600 dark:text-rose-400" : ""}
                        >
                          {SEAT_LABEL[role] ?? role} {used}
                          {limit != null ? `/${limit}` : ""}
                        </span>
                      );
                    })}
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="ghost" size="icon-sm" />}
                  aria-label="Actions"
                >
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setEditing(c)}>
                    <Pencil className="size-4" />{" "}
                    {c.isOwner ? "Edit details" : "Edit & seats"}
                  </DropdownMenuItem>
                  {!c.isOwner && (
                    <DropdownMenuItem
                      onClick={() =>
                        router.push(`/admin/users?company=${c.id}`)
                      }
                    >
                      <Users className="size-4" /> Its people
                    </DropdownMenuItem>
                  )}
                  {!c.isOwner && (
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setRemoving(c)}
                    >
                      <Trash2 className="size-4" /> Remove
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </CardContent>
          </Card>
        ))}

        {customers.length === 0 && (
          <EmptyState
            icon={Building2}
            title="No companies yet"
            description="Add one to give an organisation its own admin, its own people and its own view of the platform."
            action={
              <Button onClick={() => setCreating(true)}>
                <Plus className="size-4" /> Add a company
              </Button>
            }
          />
        )}
      </div>

      <p className="text-muted-foreground flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs">
        <KeyRound className="mt-0.5 size-3.5 shrink-0" />
        <span>
          A company admin sees only its own company, and nothing of the academy
          or of any other customer. To look at the platform as one of them, open
          their admin under Users and use Secret login.
        </span>
      </p>

      {(creating || editing) && (
        <CompanyFormDialog
          company={editing}
          rootDomain={rootDomain}
          open
          onOpenChange={(o) => {
            if (!o) {
              setCreating(false);
              setEditing(null);
            }
          }}
        />
      )}

      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Only possible while no account belongs to it. If people are still
              there, suspend the company instead — that locks everyone out and
              keeps every record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
