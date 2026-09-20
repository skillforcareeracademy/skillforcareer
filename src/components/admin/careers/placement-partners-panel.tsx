"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  Handshake,
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import type { PartnerRow } from "@/server/services/careers-service";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { PartnerDialog, apiErrorMessage } from "@/components/admin/careers/partner-dialog";

const BASE = "/api/admin/careers/placement-partners";

/** A bare domain typed into the form still needs a scheme to be a link. */
export function websiteHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/** Contact lines shared by both partner lists. */
export function PartnerContact({ partner }: { partner: PartnerRow }) {
  if (!partner.contactPerson && !partner.phone && !partner.email) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="space-y-0.5 text-sm">
      {partner.contactPerson && <p className="truncate">{partner.contactPerson}</p>}
      {partner.phone && (
        <a
          href={`tel:${partner.phone.replace(/[^+\d]/g, "")}`}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
        >
          <Phone className="size-3" /> {partner.phone}
        </a>
      )}
      {partner.email && (
        <a
          href={`mailto:${partner.email}`}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 truncate text-xs"
        >
          <Mail className="size-3" /> {partner.email}
        </a>
      )}
    </div>
  );
}

/**
 * Companies that help place our candidates. Each row counts the candidates
 * referred through it and how many of those were placed — the client's "either
 * they are placed or not", per partner.
 */
export function PlacementPartnersPanel({
  partners,
  onViewCandidates,
}: {
  partners: PartnerRow[];
  onViewCandidates: (partnerId: string) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<PartnerRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<PartnerRow | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  function openDialog(partner: PartnerRow | null) {
    setEditing(partner);
    setDialogOpen(true);
  }

  async function toggleActive(p: PartnerRow, isActive: boolean) {
    setToggling(p.id);
    try {
      await api.patch(`${BASE}/${p.id}`, { isActive });
      toast.success(isActive ? `${p.name} is active.` : `${p.name} deactivated.`);
      router.refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't update."));
    } finally {
      setToggling(null);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.del(`${BASE}/${deleting.id}`);
      toast.success("Placement partner deleted.");
      setDeleting(null);
      router.refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Delete failed."));
    }
  }

  function actions(p: PartnerRow) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />} aria-label="Actions">
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onViewCandidates(p.id)}>
            <Users className="size-4" /> View candidates
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openDialog(p)}>
            <Pencil className="size-4" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setDeleting(p)}
          >
            <Trash2 className="size-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const columns: Column<PartnerRow>[] = [
    {
      key: "name",
      header: "Partner",
      cell: (p) => (
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => openDialog(p)}
            className="hover:text-primary truncate text-left font-medium transition-colors"
          >
            {p.name}
          </button>
          <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
            {p.city && <span>{p.city}</span>}
            {p.website && (
              <a
                href={websiteHref(p.website)}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground inline-flex items-center gap-0.5"
              >
                Website <ExternalLink className="size-3" />
              </a>
            )}
          </p>
        </div>
      ),
    },
    { key: "contact", header: "Contact", cell: (p) => <PartnerContact partner={p} /> },
    {
      key: "referred",
      header: "Referred",
      headerClassName: "w-24 text-right",
      className: "text-right",
      cell: (p) => (
        <button
          type="button"
          onClick={() => onViewCandidates(p.id)}
          className="hover:text-primary font-medium tabular-nums"
        >
          {p.candidates}
        </button>
      ),
    },
    {
      key: "placed",
      header: "Placed",
      headerClassName: "w-24 text-right",
      className: "text-right",
      cell: (p) => (
        <span className="font-medium text-emerald-600 tabular-nums dark:text-emerald-400">
          {p.placed}
        </span>
      ),
    },
    {
      key: "active",
      header: "Active",
      headerClassName: "w-20",
      cell: (p) => (
        <Switch
          checked={p.isActive}
          disabled={toggling === p.id}
          onCheckedChange={(v) => toggleActive(p, v)}
          aria-label={`${p.name} active`}
        />
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      headerClassName: "w-10",
      cell: actions,
    },
  ];

  function renderCard(p: PartnerRow) {
    return (
      <div className="rounded-xl border p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium">{p.name}</p>
            {p.city && <p className="text-muted-foreground text-xs">{p.city}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Switch
              checked={p.isActive}
              disabled={toggling === p.id}
              onCheckedChange={(v) => toggleActive(p, v)}
              aria-label={`${p.name} active`}
            />
            {actions(p)}
          </div>
        </div>
        <div className="mt-3">
          <PartnerContact partner={p} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge variant="secondary">{p.candidates} referred</Badge>
          <Badge variant="secondary" className="text-emerald-700 dark:text-emerald-400">
            {p.placed} placed
          </Badge>
          {!p.isActive && <Badge variant="outline">Inactive</Badge>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">
          Companies that give our candidates placement support. Assign a candidate to one
          from their sheet in Candidates.
        </p>
        <Button onClick={() => openDialog(null)} className="shrink-0">
          <Plus className="size-4" /> Add placement partner
        </Button>
      </div>

      <DataTable
        data={partners}
        columns={columns}
        rowKey={(p) => p.id}
        renderCard={renderCard}
        emptyIcon={Handshake}
        emptyTitle="No placement partners yet"
        emptyDescription="Add the companies that help place your candidates, then assign candidates to them."
      />

      <PartnerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        partner={editing}
        basePath={BASE}
        noun="placement partner"
        onSaved={() => router.refresh()}
      />

      <AlertDialog open={deleting != null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.candidates
                ? `Its ${deleting.candidates} candidate${deleting.candidates === 1 ? "" : "s"} stay on record, just no longer linked to this partner. `
                : ""}
              To keep the history, switch it off instead.
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
