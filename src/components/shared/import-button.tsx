"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Loader2, Upload } from "lucide-react";
import {
  IMPORT_MODES,
  IMPORT_MODE_LABEL,
  IMPORT_MODE_HINT,
  type ImportMode,
} from "@/lib/validations/import-mode";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Import, having first asked what to do about anything already there.
 *
 * "Also provide a toggle to decide replace similar content or not or create a
 * copy of imported data." Asking before the file picker opens rather than
 * burying it in a settings menu: by the time a sheet is chosen the decision has
 * been made, and an import that quietly overwrote a term's work is not
 * something a toast can undo.
 */
export function ImportButton({
  onImport,
  busy = false,
  label = "Import",
  title = "Import from a sheet",
  description = "Rows are matched by title. Choose what should happen when a title is already here.",
  accept = ".csv,text/csv",
}: {
  onImport: (file: File, mode: ImportMode) => void | Promise<void>;
  busy?: boolean;
  label?: string;
  title?: string;
  description?: string;
  accept?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ImportMode>("update");
  const fileRef = useRef<HTMLInputElement>(null);

  function chosen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // so the same file can be picked twice
    if (!file) return;
    setOpen(false);
    void onImport(file, mode);
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="size-4" /> {title}
            </DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <RadioGroup
            value={mode}
            onValueChange={(v) => v && setMode(v as ImportMode)}
            className="gap-3"
          >
            {IMPORT_MODES.map((m) => (
              <label
                key={m}
                className="hover:bg-accent/40 flex cursor-pointer items-start gap-3 rounded-lg border p-3"
              >
                <RadioGroupItem value={m} className="mt-0.5" />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">{IMPORT_MODE_LABEL[m]}</span>
                  <span className="text-muted-foreground block text-xs">
                    {IMPORT_MODE_HINT[m]}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" /> Choose the file
            </Button>
          </DialogFooter>
          <Label className="sr-only" htmlFor="import-file">
            Sheet to import
          </Label>
          <input
            id="import-file"
            ref={fileRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={chosen}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
