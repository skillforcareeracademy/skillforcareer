"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Loader2, Trash2, Undo2 } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { PageHeader } from "@/components/shared/page-header";

interface Row {
  id: string;
  kind: string;
  kindLabel: string;
  title: string;
  subtitle: string | null;
  deletedBy: string;
  deletedAt: string;
  canRestore: boolean;
}

/**
 * The recycle bin, shared by all three panels. What it holds is decided on the
 * server — staff see everything thrown away, an instructor sees their own, and
 * a learner sees their own notes — so this component needs no role of its own.
 */
export function RecycleBinClient({ scopeNote }: { scopeNote: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [purging, setPurging] = useState<Row | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ rows: Row[]; total: number }>("/api/recycle-bin");
      setRows(res.rows);
      setTotal(res.total);
    } catch {
      toast.error("Couldn't open the recycle bin.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Deferred so the page paints before the loading cascade.
  useEffect(() => {
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load]);

  async function restore(row: Row) {
    setBusy(row.id);
    try {
      const res = await api.post<{ message: string }>(`/api/recycle-bin/${row.id}`);
      toast.success(res.message);
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't restore that.");
    } finally {
      setBusy(null);
    }
  }

  async function purge(row: Row) {
    setBusy(row.id);
    try {
      await api.del(`/api/recycle-bin/${row.id}`);
      toast.success("Deleted for good.");
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't delete that.");
    } finally {
      setBusy(null);
      setPurging(null);
    }
  }

  async function empty() {
    setBusy("all");
    try {
      const res = await api.del<{ message: string }>("/api/recycle-bin");
      toast.success(res.message);
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't empty the bin.");
    } finally {
      setBusy(null);
      setConfirmEmpty(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recycle bin"
        description={scopeNote}
        actions={
          rows.length > 0 ? (
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmEmpty(true)}
              disabled={busy !== null}
            >
              {busy === "all" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Empty the bin
            </Button>
          ) : undefined
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Deleted items</CardTitle>
          <CardDescription>
            {total === 0
              ? "Nothing has been thrown away."
              : `${total} item${total === 1 ? "" : "s"} waiting. Restoring puts something back exactly where it was.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground flex items-center justify-center gap-2 py-8 text-sm">
              <Loader2 className="size-4 animate-spin" /> Opening…
            </p>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              The recycle bin is empty.
            </p>
          ) : (
            <ul className="divide-y">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="shrink-0">
                        {row.kindLabel}
                      </Badge>
                      <span className="truncate text-sm font-medium">{row.title}</span>
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {row.subtitle ? `${row.subtitle} · ` : ""}
                      deleted by {row.deletedBy}{" "}
                      {formatDistanceToNow(new Date(row.deletedAt), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void restore(row)}
                      disabled={busy !== null || !row.canRestore}
                      title={
                        row.canRestore
                          ? undefined
                          : "Something else is using its place now."
                      }
                    >
                      {busy === row.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Undo2 className="size-4" />
                      )}
                      Restore
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setPurging(row)}
                      disabled={busy !== null}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmEmpty} onOpenChange={setConfirmEmpty}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Empty the recycle bin?</AlertDialogTitle>
            <AlertDialogDescription>
              All {total} item{total === 1 ? "" : "s"} go for good. Nothing here can
              be restored afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void empty()} disabled={busy !== null}>
              Empty it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={purging !== null} onOpenChange={(o) => !o && setPurging(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{purging?.title}&rdquo; for good?</AlertDialogTitle>
            <AlertDialogDescription>
              It leaves the recycle bin and cannot be restored.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => purging && void purge(purging)}
              disabled={busy !== null}
            >
              Delete for good
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
