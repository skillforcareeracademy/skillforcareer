"use client";

import { AlertTriangle, CheckCircle2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ImportOutcome {
  created: number;
  updated: number;
  skipped: { row: number; reason: string }[];
  message?: string;
}

/**
 * What the sheet actually did.
 *
 * A toast saying "412 skipped" tells the office nothing it can act on — "if
 * any reason is there for not getting uploaded, that reason should be
 * reflected". So every skipped row is listed with its line number and the
 * reason, and the whole list downloads as a sheet to work through.
 */
export function ImportResultDialog({
  outcome,
  onClose,
  noun = "rows",
}: {
  outcome: ImportOutcome | null;
  onClose: () => void;
  noun?: string;
}) {
  if (!outcome) return null;
  const { created, updated, skipped } = outcome;
  const clean = skipped.length === 0;

  function downloadReasons() {
    const csv = [
      "Row,Reason",
      ...skipped.map((s) => `${s.row},"${s.reason.replace(/"/g, '""')}"`),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "import-skipped-rows.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {clean ? (
              <CheckCircle2 className="size-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="size-4 text-amber-600" />
            )}
            Import finished
          </DialogTitle>
          <DialogDescription>
            {outcome.message ??
              `${created} added, ${updated} updated, ${skipped.length} skipped.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            ["Added", created],
            ["Updated", updated],
            ["Skipped", skipped.length],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border p-3">
              <p className="text-2xl font-semibold">{value}</p>
              <p className="text-muted-foreground text-xs">{label}</p>
            </div>
          ))}
        </div>

        {!clean && (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              Why {skipped.length} {noun} didn&rsquo;t go in
            </p>
            <div className="max-h-60 overflow-y-auto rounded-lg border">
              <table className="w-full text-sm">
                <tbody className="divide-y">
                  {skipped.map((s) => (
                    <tr key={`${s.row}-${s.reason}`}>
                      <td className="text-muted-foreground w-20 px-3 py-1.5 align-top text-xs">
                        Row {s.row}
                      </td>
                      <td className="px-3 py-1.5 text-xs">{s.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter>
          {!clean && (
            <Button variant="outline" onClick={downloadReasons}>
              <Download className="size-4" /> Download the list
            </Button>
          )}
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
