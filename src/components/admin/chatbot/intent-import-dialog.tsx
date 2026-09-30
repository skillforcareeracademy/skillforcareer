"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { parseCsv } from "@/lib/csv";
import {
  CHAT_INTENT_CSV_COLUMNS,
  PATTERN_SEPARATOR,
} from "@/lib/validations/chatbot";
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

/**
 * Teach Ami from a spreadsheet — "AI train krne ke liye questions import export
 * ka option de do".
 *
 * Answers are matched on the question, so an export can be edited and imported
 * back without doubling anything: the round trip is the point, not just the
 * first load.
 */
export function IntentImportDialog({
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
        question: pick(row, "Question", "Q", "Ask"),
        patterns: pick(row, "Patterns", "Keywords", "Variations"),
        answer: pick(row, "Answer", "A", "Response"),
        category: pick(row, "Category", "Group"),
        actionLabel: pick(row, "Action label", "Button"),
        actionUrl: pick(row, "Action URL", "Link", "URL"),
        isSuggested: pick(row, "Suggested", "Starter", "Chip"),
        isActive: pick(row, "Active", "Live", "Enabled"),
      }))
      .filter((r) => r.question.trim() || r.answer.trim());

    if (rows.length === 0) {
      toast.error("No question and answer rows in that sheet.");
      return;
    }

    setImporting(true);
    try {
      const res = await api.post<ImportResult>("/api/chatbot/intents/import", {
        rows,
      });
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
          <DialogTitle>Import answers</DialogTitle>
          <DialogDescription>
            One row per answer. A question Ami already knows is updated rather
            than added twice, so an exported sheet can be edited and loaded
            back.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="bg-muted/40 rounded-lg border p-3">
            <p className="text-sm font-medium">Columns</p>
            <p className="text-muted-foreground mt-1 font-mono text-xs break-words">
              {CHAT_INTENT_CSV_COLUMNS.join(", ")}
            </p>
            <p className="text-muted-foreground mt-2 text-xs">
              <strong>Question</strong> and <strong>Answer</strong> are
              required. Separate patterns with <code>{PATTERN_SEPARATOR}</code>.
              Leave <strong>Suggested</strong> and <strong>Active</strong> blank
              to keep what an existing answer already has.
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
            <Button
              type="button"
              variant="outline"
              onClick={() => inputRef.current?.click()}
            >
              <FileSpreadsheet className="size-4" />
              {fileName || "Choose a CSV"}
            </Button>
            <Button
              variant="ghost"
              nativeButton={false}
              render={<a href="/api/chatbot/intents/template" download />}
            >
              <Download className="size-4" /> Template
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="intent-csv">Or paste the rows</Label>
            <Textarea
              id="intent-csv"
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
                setResult(null);
              }}
              rows={6}
              placeholder={CHAT_INTENT_CSV_COLUMNS.join(",")}
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
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          <Button
            type="button"
            onClick={run}
            disabled={importing || !csv.trim()}
          >
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
