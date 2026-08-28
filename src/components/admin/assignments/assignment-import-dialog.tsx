"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { parseCsv } from "@/lib/csv";
import { ASSIGNMENT_CSV_COLUMNS } from "@/lib/validations/assignment";
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

interface ImportResult {
  imported: number;
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

/**
 * Bulk-create assignments from a spreadsheet.
 *
 * The client asked for it in as many words: "there is not bulk upload
 * assignment option in lms". A term's worth of work set one dialog at a time is
 * the slow part, and the timetable is already a sheet. Courses and batches are
 * matched by name on the server, so the file is written against the timetable
 * rather than against database ids.
 */
export function AssignmentImportDialog({
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

  async function run() {
    const { rows: parsed } = parseCsv(csv);
    const rows = parsed
      .map((row) => ({
        title: pick(row, "Title", "Assignment", "Name").trim(),
        course: pick(row, "Course", "Course title"),
        batches: pick(row, "Batches", "Batch", "Cohort"),
        type: pick(row, "Type", "Assignment type") || "FILE",
        gradingMode: pick(row, "Grading", "Grading mode", "Marking") || "MANUAL",
        maxScore: Number(pick(row, "Max score", "Marks", "Points")) || 100,
        dueDate: pick(row, "Due date", "Due", "Deadline"),
        allowLate: pick(row, "Allow late", "Late"),
        description: pick(row, "Description", "Summary"),
        instructions: pick(row, "Instructions", "Details"),
      }))
      .filter((r) => r.title);

    if (rows.length === 0) {
      toast.error("No rows with a title in that sheet.");
      return;
    }

    setImporting(true);
    try {
      const res = await api.post<ImportResult>("/api/assignments/import", { rows });
      setResult(res);
      if (res.imported > 0) {
        toast.success(res.message);
        router.refresh();
      } else {
        toast.error("Nothing could be imported — see the rows below.");
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't import that sheet.");
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
          <DialogTitle>Bulk upload assignments</DialogTitle>
          <DialogDescription>
            One row per assignment. Courses and batches are matched by name, so
            write them exactly as they appear in the LMS.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="bg-muted/40 rounded-lg border p-3">
            <p className="text-sm font-medium">Columns</p>
            <p className="text-muted-foreground mt-1 font-mono text-xs break-words">
              {ASSIGNMENT_CSV_COLUMNS.join(", ")}
            </p>
            <p className="text-muted-foreground mt-2 text-xs">
              Only <strong>Title</strong> is required. Leave <strong>Batches</strong>{" "}
              blank to set it for everyone on the course. Dates can be{" "}
              <code>2026-09-30</code> or <code>30/09/2026</code>.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              nativeButton={false}
              render={<a href="/api/assignments/template" download />}
            >
              <Download className="size-4" /> Download a sample sheet
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => inputRef.current?.click()}>
              <FileSpreadsheet className="size-4" /> Choose a CSV
            </Button>
            {fileName && (
              <span className="text-muted-foreground truncate text-sm">{fileName}</span>
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
            <Label htmlFor="assignment-csv">…or paste rows straight from a sheet</Label>
            <Textarea
              id="assignment-csv"
              rows={6}
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
                setResult(null);
              }}
              placeholder={`${ASSIGNMENT_CSV_COLUMNS.join(",")}\nModule 1 quiz,Medical Coding Course,MC-SEP26,MCQ,Auto,50,2026-09-30,Yes,,`}
              className="font-mono text-xs"
            />
          </div>

          {result && (
            <div className="space-y-2 rounded-lg border p-3 text-sm">
              <p>
                <strong>{result.imported}</strong> created
                {result.skipped > 0 && <> · {result.skipped} skipped</>}
              </p>
              {result.errors.length > 0 && (
                <ul className="text-muted-foreground max-h-40 space-y-1 overflow-y-auto text-xs">
                  {result.errors.map((err) => (
                    <li key={`${err.row}-${err.message}`}>
                      Row {err.row}: {err.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {result?.imported ? "Done" : "Cancel"}
          </Button>
          <Button onClick={run} disabled={!csv.trim() || importing}>
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
