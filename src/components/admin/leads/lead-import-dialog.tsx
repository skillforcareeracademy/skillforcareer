"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import {
  LEAD_SOURCES,
  LEAD_SOURCE_LABELS,
  type LeadSource,
} from "@/lib/validations/lead";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MAX_BYTES = 2 * 1024 * 1024;

interface ImportResult {
  imported: number;
  skipped: number;
  errors: { row: number; message: string }[];
  message: string;
}

/**
 * CSV import. The file is read in the browser and posted as text — the server
 * owns the parsing so the same rules apply however the CSV arrives, and
 * counsellors can equally paste a few rows straight out of a sheet.
 */
export function LeadImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [source, setSource] = useState<LeadSource>("MANUAL");
  const [skipDuplicatePhones, setSkipDuplicatePhones] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  function reset() {
    setCsv("");
    setFileName("");
    setResult(null);
  }

  async function pickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error("Keep the file under 2 MB — split a larger sheet in two.");
      return;
    }
    setCsv(await file.text());
    setFileName(file.name);
    setResult(null);
  }

  async function runImport() {
    setImporting(true);
    try {
      const res = await api.post<ImportResult>("/api/leads/import", {
        csv,
        source,
        skipDuplicatePhones,
      });
      setResult(res);
      if (res.imported > 0) {
        toast.success(res.message);
        router.refresh();
      } else {
        toast.error("Nothing was imported — check the rows below.");
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import leads</DialogTitle>
          <DialogDescription>
            Upload a CSV, or paste rows copied from Excel or Google Sheets.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
              // A plain anchor, not next/link: the response is a
              // Content-Disposition download, and client-side navigation to it
              // would leave the user on a blank route instead of saving a file.
              // eslint-disable-next-line @next/next/no-html-link-for-pages
              render={<a href="/api/leads/template" />}
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
            <Label htmlFor="import-csv">CSV content</Label>
            <Textarea
              id="import-csv"
              rows={6}
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
                setResult(null);
              }}
              placeholder={
                "Name,Number,Email,Course,Stage,Status,Fees Offered\nJitendra Kumar,9876543210,…"
              }
              className="font-mono text-xs"
            />
            <p className="text-muted-foreground text-xs">
              {rowCount > 0
                ? `${rowCount} row${rowCount === 1 ? "" : "s"} ready. `
                : ""}
              Only <strong>Name</strong> and <strong>Number</strong> are
              required; every other column from the template is optional.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Source for rows without one</Label>
              <Select
                value={source}
                onValueChange={(v) => setSource((v as LeadSource) ?? "MANUAL")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v) => LEAD_SOURCE_LABELS[(v as LeadSource) ?? "MANUAL"]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {LEAD_SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {LEAD_SOURCE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-start gap-2 pt-6 text-sm">
              <Checkbox
                checked={skipDuplicatePhones}
                onCheckedChange={(v) => setSkipDuplicatePhones(v === true)}
              />
              <span>Skip numbers that already exist</span>
            </label>
          </div>

          {result && (
            <div className="bg-muted/40 space-y-2 rounded-lg p-3 text-sm">
              <p>
                <strong>{result.imported}</strong> imported
                {result.skipped > 0 && (
                  <> · {result.skipped} skipped as duplicates</>
                )}
                {result.errors.length > 0 && (
                  <> · {result.errors.length} row(s) not read</>
                )}
              </p>
              {result.errors.length > 0 && (
                <ul className="text-muted-foreground max-h-32 space-y-0.5 overflow-y-auto text-xs">
                  {result.errors.slice(0, 30).map((e) => (
                    <li key={`${e.row}-${e.message}`}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                  {result.errors.length > 30 && (
                    <li>…and {result.errors.length - 30} more.</li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
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
