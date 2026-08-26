"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/shared/page-header";
import {
  GLOBAL_SECTION_KEYS,
  HOME_SECTIONS,
  isAlwaysOn,
  isGlobalSection,
} from "@/lib/validations/homepage";
import { cn } from "@/lib/utils";
import { IconGlyph } from "./icon-glyph";
import { SectionEditor } from "./section-editor";
import type { EditableSection } from "./types";

export function HomepageClient({ initial }: { initial: EditableSection[] }) {
  const router = useRouter();
  const [sections, setSections] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Local state exists so a toggle or a reorder lands instantly; once the server
  // has caught up, its copy is the truth again. Adjusted during render rather
  // than in an effect — React re-runs this pass before painting, so the list
  // never flashes the stale copy. Open editors keep their unsaved draft; that
  // lives inside SectionEditor, not here.
  const [synced, setSynced] = useState(initial);
  if (synced !== initial) {
    setSynced(initial);
    setSections(initial);
  }

  // The header, closing banner and footer run on every public page, so they
  // can't be slotted into the homepage's running order — they get their own
  // group below, listed top-to-bottom as a visitor meets them.
  const inPage = sections.filter((s) => !isGlobalSection(s.key));
  const everywhere = sections
    .filter((s) => isGlobalSection(s.key))
    .sort(
      (a, b) => GLOBAL_SECTION_KEYS.indexOf(a.key) - GLOBAL_SECTION_KEYS.indexOf(b.key),
    );

  async function toggleVisible(section: EditableSection, enabled: boolean) {
    setSections((prev) =>
      prev.map((s) => (s.key === section.key ? { ...s, enabled } : s)),
    );
    setBusy(section.key);
    try {
      await api.patch(`/api/homepage/${section.key}`, { enabled });
      toast.success(
        `${HOME_SECTIONS[section.key].label} ${enabled ? "is now live" : "is hidden"}.`,
      );
      router.refresh();
    } catch (e) {
      setSections((prev) =>
        prev.map((s) => (s.key === section.key ? { ...s, enabled: !enabled } : s)),
      );
      toast.error(e instanceof ApiError ? e.message : "Couldn't save. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= inPage.length) return;

    const reordered = [...inPage];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const previous = sections;
    const next = [...reordered, ...everywhere];
    setSections(next);

    setBusy("order");
    try {
      await api.patch("/api/homepage", { keys: next.map((s) => s.key) });
      router.refresh();
    } catch (e) {
      setSections(previous);
      toast.error(e instanceof ApiError ? e.message : "Couldn't save the new order.");
    } finally {
      setBusy(null);
    }
  }

  function renderCard(
    section: EditableSection,
    position: { index: number; total: number } | null,
  ) {
    const spec = HOME_SECTIONS[section.key];
    const open = editing === section.key;

    return (
      <div
        key={section.key}
        className={cn(
          "bg-card overflow-hidden rounded-xl border transition-colors",
          open && "border-primary/40 shadow-sm",
          !section.enabled && !open && "bg-muted/30",
        )}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 sm:p-4">
          {position && (
            <div className="flex shrink-0 flex-col">
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-5"
                onClick={() => move(position.index, -1)}
                disabled={position.index === 0 || busy === "order"}
                aria-label={`Move ${spec.label} up`}
              >
                <ChevronUp className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-5"
                onClick={() => move(position.index, 1)}
                disabled={position.index === position.total - 1 || busy === "order"}
                aria-label={`Move ${spec.label} down`}
              >
                <ChevronDown className="size-4" />
              </Button>
            </div>
          )}

          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-lg",
              section.enabled
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            <IconGlyph name={spec.icon} className="size-5" />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{spec.label}</p>
              {!section.enabled && (
                <Badge variant="secondary" className="gap-1">
                  <EyeOff className="size-3" /> Hidden
                </Badge>
              )}
              {section.customised && section.updatedAt && (
                <span className="text-muted-foreground text-xs">
                  edited {formatDistanceToNow(new Date(section.updatedAt), { addSuffix: true })}
                </span>
              )}
            </div>
            <p className="text-muted-foreground text-sm">{spec.description}</p>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {/* No switch for the header and footer: a public site without
                either has no navigation and no contact details, and the way
                back is through this page. */}
            {!isAlwaysOn(section.key) && (
              <Switch
                checked={section.enabled}
                onCheckedChange={(v) => toggleVisible(section, v)}
                disabled={busy === section.key}
                aria-label={`${section.enabled ? "Hide" : "Show"} ${spec.label}`}
              />
            )}
            <Button
              variant={open ? "secondary" : "outline"}
              size="sm"
              onClick={() => setEditing(open ? null : section.key)}
            >
              <Pencil className="size-4" />
              {open ? "Close" : "Edit"}
            </Button>
          </div>
        </div>

        {open && <SectionEditor section={section} />}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Homepage"
        description="The public site's content — the landing page band by band, plus the header and footer every page carries. Reorder it, switch parts off, and edit every word."
        actions={
          <Button
            variant="outline"
            nativeButton={false}
            render={<a href="/" target="_blank" rel="noreferrer" />}
          >
            <ExternalLink className="size-4" /> View homepage
          </Button>
        }
      />

      <div className="flex items-center gap-2">
        <Eye className="text-muted-foreground size-4" aria-hidden />
        <p className="text-muted-foreground text-sm">
          Sections appear top to bottom in this order. Changes go live as soon as
          you save.
        </p>
        {busy === "order" && (
          <Loader2 className="text-muted-foreground size-4 animate-spin" aria-hidden />
        )}
      </div>

      <div className="space-y-3">
        {inPage.map((section, index) =>
          renderCard(section, { index, total: inPage.length }),
        )}
      </div>

      {everywhere.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-muted-foreground pt-2 text-sm font-medium">
            Shown on every public page
          </h2>
          {everywhere.map((section) => renderCard(section, null))}
        </div>
      )}
    </div>
  );
}
