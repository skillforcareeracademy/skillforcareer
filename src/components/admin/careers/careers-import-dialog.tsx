"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { parseCsv } from "@/lib/csv";
import {
  CANDIDATE_CSV_COLUMNS,
  PARTNER_CSV_COLUMNS,
} from "@/lib/validations/careers";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const MAX_BYTES = 2 * 1024 * 1024;

export type ImportKind = "placement" | "hiring" | "candidate";

interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
  message: string;
}

/** Find a column by any of a few spellings, so a hand-edited sheet still loads. */
function pick(row: Record<string, string>, ...names: string[]): string {
  for (const name of names) {
    const hit = Object.keys(row).find(
      (k) => k.trim().toLowerCase() === name.toLowerCase(),
    );
    if (hit && row[hit] != null) return row[hit];
  }
  return "";
}

const SHAPE: Record<
  ImportKind,
  {
    title: string;
    endpoint: string;
    templateKind: "partner" | "candidate";
    columns: readonly string[];
    required: string;
    matchedOn: string;
  }
> = {
  placement: {
    title: "Import placement partners",
    endpoint: "/api/admin/careers/placement-partners/import",
    templateKind: "partner",
    columns: PARTNER_CSV_COLUMNS,
    required: "Name",
    matchedOn: "name",
  },
  hiring: {
    title: "Import hiring partners",
    endpoint: "/api/admin/careers/hiring-partners/import",
    templateKind: "partner",
    columns: PARTNER_CSV_COLUMNS,
    required: "Name",
    matchedOn: "name",
  },
  candidate: {
    title: "Import candidates",
    endpoint: "/api/admin/careers/candidates/import",
    templateKind: "candidate",
    columns: CANDIDATE_CSV_COLUMNS,
    required: "Name, Email and Phone",
    matchedOn: "email",
  },
};

function rowsFor(kind: ImportKind, parsed: Record<string, string>[]) {
  if (kind === "candidate") {
    return parsed
      .map((row) => ({
        name: pick(row, "Name", "Candidate", "Student"),
        email: pick(row, "Email", "Email address"),
        phone: pick(row, "Phone", "Mobile", "Contact"),
        course: pick(row, "Course", "Programme", "Program"),
        batch: pick(row, "Batch", "Batch code"),
        jobExpecting: pick(row, "Job expecting", "Role", "Profile"),
        experienceLevel: pick(
          row,
          "Fresher / Experienced",
          "Experience",
          "Level",
        ),
        experienceDetails: pick(row, "Experience details", "Details"),
        expectedLocation: pick(row, "Expected location", "Location", "City"),
        expectedMode: pick(row, "Mode", "Work mode"),
        joiningAvailability: pick(row, "Joining availability", "Availability"),
        status: pick(row, "Status"),
        placementPartner: pick(row, "Placement partner", "Agent"),
        hiringPartner: pick(row, "Hiring partner", "Company"),
        notes: pick(row, "Notes", "Remarks"),
      }))
      .filter((r) => r.name.trim() || r.email.trim());
  }
  return parsed
    .map((row) => ({
      name: pick(row, "Name", "Company", "Partner"),
      contactPerson: pick(row, "Contact person", "Contact", "Person"),
      email: pick(row, "Email", "Email address"),
      phone: pick(row, "Phone", "Mobile", "Contact number"),
      website: pick(row, "Website", "Site", "URL"),
      city: pick(row, "City", "Location"),
      notes: pick(row, "Notes", "Remarks"),
      isActive: pick(row, "Active", "Is active", "Status"),
    }))
    .filter((r) => r.name.trim());
}

/**
 * Load one of the careers tabs from a spreadsheet.
 *
 * All three tabs asked for it at once — "career me import export ka option for
 * all 3 tabs" — and they differ only in their columns, so they share a dialog.
 * A row already here is updated rather than added twice, which is what makes
 * export → edit → import safe to repeat.
 */
export function CareersImportDialog({
  kind,
  open,
  onOpenChange,
}: {
  kind: ImportKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const shape = SHAPE[kind];

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

  async function run() {
    const { rows: parsed } = parseCsv(csv);
    const rows = rowsFor(kind, parsed);

    if (rows.length === 0) {
      toast.error("No usable rows in that sheet.");
      return;
    }

    setImporting(true);
    try {
      const res = await api.post<ImportResult>(shape.endpoint, { rows });
      setResult(res);
      if (res.imported + res.updated > 0) {
        toast.success(res.message);
        router.refresh();
      } else {
        toast.error("Nothing could be imported — see the rows below.");
      }
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "Couldn't import that sheet.",
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{shape.title}</DialogTitle>
          <DialogDescription>
            One row each. A row matching one already here — on {shape.matchedOn}{" "}
            — is updated rather than added again.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="bg-muted/40 rounded-lg border p-3">
            <p className="text-sm font-medium">Columns</p>
            <p className="text-muted-foreground mt-1 font-mono text-xs break-words">
              {shape.columns.join(", ")}
            </p>
            <p className="text-muted-foreground mt-2 text-xs">
              <strong>{shape.required}</strong>{" "}
              {kind === "candidate" ? "are" : "is"} required. Courses and
              partners are matched by name, so write them as they appear in the
              LMS.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={pickFile}
            />
            <Button variant="outline" onClick={() => inputRef.current?.click()}>
              <FileSpreadsheet className="size-4" />
              {fileName || "Choose a CSV"}
            </Button>
            <Button
              variant="ghost"
              nativeButton={false}
              render={
                <a
                  href={`/api/admin/careers/templates?kind=${shape.templateKind}`}
                  download
                />
              }
            >
              <Download className="size-4" /> Template
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="careers-csv">Or paste the rows</Label>
            <Textarea
              id="careers-csv"
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
                setResult(null);
              }}
              rows={6}
              placeholder={shape.columns.join(",")}
              className="font-mono text-xs"
            />
          </div>

          {result && (
            <div className="space-y-2 rounded-lg border p-3">
              <p className="text-sm font-medium">{result.message}</p>
              {result.errors.length > 0 && (
                <ul className="text-muted-foreground max-h-40 space-y-1 overflow-y-auto text-xs">
                  {result.errors.map((e) => (
                    <li key={`${e.row}-${e.message}`}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={run} disabled={importing || !csv.trim()}>
            {importing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
