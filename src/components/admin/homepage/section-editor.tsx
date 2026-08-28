"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
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
import { isListField } from "@/lib/validations/homepage";
import { cn } from "@/lib/utils";
import { FieldControl } from "./field-control";
import { ListFieldEditor } from "./list-field";
import type { EditableRecord, SectionSpec } from "./types";

/**
 * The form behind one editable section.
 *
 * Registry-agnostic on purpose: Admin → Homepage and Admin → Pages hold their
 * content in different tables under different keys, but a "section" is the same
 * thing in both — a spec that says which controls to draw, and an endpoint that
 * takes the result. `maxLengthFor` comes from whichever Zod schema owns the
 * section, so the boxes can't accept more than the database will store.
 */
export function SectionEditor({
  section,
  spec,
  endpoint,
  maxLengthFor,
}: {
  section: EditableRecord;
  spec: SectionSpec;
  /** Where PATCH (save) and DELETE (reset to original) go. */
  endpoint: string;
  maxLengthFor: (path: (string | number)[]) => number | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState<Record<string, unknown>>(section.data);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Deep-compares the whole section — lists nest, so a shallow check would call
  // a reordered FAQ "unchanged".
  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(section.data),
    [form, section.data],
  );

  function set(name: string, value: unknown) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      await api.patch(endpoint, { data: form });
      toast.success(`${spec.label} saved.`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    setResetting(true);
    try {
      const restored = await api.del<EditableRecord>(endpoint);
      setForm(restored.data);
      toast.success(`${spec.label} restored to the original content.`);
      setConfirmReset(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't reset. Try again.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="space-y-5 border-t p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {spec.fields.map((field) =>
          isListField(field) ? (
            <div key={field.name} className="sm:col-span-2">
              <ListFieldEditor
                spec={field}
                path={[field.name]}
                maxLengthFor={maxLengthFor}
                value={form[field.name]}
                onChange={(next) => set(field.name, next)}
              />
            </div>
          ) : (
            <div key={field.name} className={cn(field.wide && "sm:col-span-2")}>
              <FieldControl
                field={field}
                value={form[field.name]}
                onChange={(next) => set(field.name, next)}
                maxLength={maxLengthFor([field.name])}
              />
            </div>
          ),
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => setConfirmReset(true)}
          disabled={!section.customised}
        >
          <RotateCcw className="size-4" />
          Reset to original
        </Button>

        <div className="flex items-center gap-2">
          {dirty && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setForm(section.data)}
            >
              Discard changes
            </Button>
          )}
          <Button type="button" onClick={save} disabled={!dirty || saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save changes
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset “{spec.label}” to the original content?</AlertDialogTitle>
            <AlertDialogDescription>
              Every edit made to this section goes back to the copy the site
              launched with. Where it sits on the page, and whether it&apos;s
              visible, stay as they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={reset}
              disabled={resetting}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              {resetting && <Loader2 className="size-4 animate-spin" />}
              Reset section
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
