"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const MAX_BYTES = 1024 * 1024;

interface RowResult {
  row: number;
  name: string;
  email: string;
  status: "added" | "created" | "skipped";
  reason?: string;
}
interface ImportResult {
  added: number;
  created: number;
  skipped: number;
  rows: RowResult[];
  message: string;
}

const STATUS: Record<
  RowResult["status"],
  { label: string; className: string }
> = {
  added: {
    label: "Added",
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  created: {
    label: "New + added",
    className: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  },
  skipped: {
    label: "Skipped",
    className:
      "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  },
};

/**
 * Import a batch's learners from a CSV (`name,email,phone`). The file is read
 * in the browser and posted as text; the server matches each row to an account
 * (or creates one), enrols them and reports back row by row.
 */
export function BatchImportDialog({
  batchId,
  batchName,
  open,
  onOpenChange,
}: {
  batchId: string;
  batchName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  function reset() {
    setCsv("");
    setFileName("");
    setResult(null);
  }

  function close() {
    onOpenChange(false);
    reset();
  }

  async function pickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error("Keep the file under 1 MB — split a larger sheet in two.");
      return;
    }
    setCsv(await file.text());
    setFileName(file.name);
    setResult(null);
  }

  async function runImport() {
    setImporting(true);
    try {
      const res = await api.post<ImportResult>(
        `/api/batches/${batchId}/import`,
        { csv },
      );
      setResult(res);
      if (res.added > 0) {
        toast.success(res.message);
        router.refresh();
      } else {
        toast.error("Nobody was added — check the rows below.");
      }
    } catch (err) {
      const d =
        err instanceof ApiError
          ? (err.details as { issues?: { message: string }[] })
          : undefined;
      toast.error(
        d?.issues?.[0]?.message ??
          (err instanceof ApiError ? err.message : "Import failed."),
      );
    } finally {
      setImporting(false);
    }
  }

  const rowCount = csv ? Math.max(0, csv.trim().split(/\r?\n/).length - 1) : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import students</DialogTitle>
          <DialogDescription>
            Add learners to {batchName} from a sheet. Anyone without an account
            gets one, and everyone added is emailed their batch details.
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="size-4" /> Choose CSV
            </Button>
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              // A plain anchor: the response is a file download, which a
              // client-side navigation would turn into a blank page.
              render={<a href={`/api/batches/${batchId}/import`} />}
            >
              <Download className="size-4" /> Download template
            </Button>
            {fileName && (
              <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
                <FileSpreadsheet className="size-3.5 shrink-0" />
                <span className="truncate">{fileName}</span>
              </span>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={pickFile}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="batch-import-csv">CSV content</Label>
            <Textarea
              id="batch-import-csv"
              rows={5}
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
                setResult(null);
              }}
              placeholder={
                "name,email,phone\nPriya Sharma,priya@example.com,9876543210"
              }
              className="font-mono text-xs"
            />
            <p className="text-muted-foreground text-xs">
              {rowCount > 0
                ? `${rowCount} row${rowCount === 1 ? "" : "s"} ready. `
                : ""}
              <strong>email</strong> is required; <strong>name</strong> is
              needed for anyone without an account yet. Seats are filled in file
              order until the batch is full.
            </p>
          </div>

          {result && (
            <div className="space-y-2">
              <p className="text-sm">
                <strong>{result.added}</strong> added
                {result.created > 0 && <> · {result.created} new accounts</>}
                {result.skipped > 0 && <> · {result.skipped} skipped</>}
              </p>
              <ul className="max-h-60 divide-y overflow-y-auto rounded-lg border text-sm">
                {result.rows.map((r) => (
                  <li key={r.row} className="flex items-start gap-3 px-3 py-2">
                    <span className="text-muted-foreground w-10 shrink-0 pt-0.5 text-xs tabular-nums">
                      #{r.row}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {r.name || r.email || "—"}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {r.email}
                        {r.reason ? ` · ${r.reason}` : ""}
                      </p>
                    </div>
                    <Badge
                      variant="secondary"
                      className={cn("shrink-0", STATUS[r.status].className)}
                    >
                      {STATUS[r.status].label}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            {result ? "Done" : "Cancel"}
          </Button>
          <Button
            type="button"
            onClick={runImport}
            disabled={importing || !csv.trim()}
          >
            {importing && <Loader2 className="size-4 animate-spin" />}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
