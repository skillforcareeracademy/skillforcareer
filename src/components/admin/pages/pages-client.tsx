"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink, Eye, EyeOff, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/shared/page-header";
import { maxLengthIn } from "@/lib/validations/homepage";
import {
  PAGE_GROUPS,
  PAGE_SECTIONS,
  isPageSectionAlwaysOn,
  type PageSectionKey,
} from "@/lib/validations/pages";
import { cn } from "@/lib/utils";
import { IconGlyph } from "@/components/admin/homepage/icon-glyph";
import { SectionEditor } from "@/components/admin/homepage/section-editor";
import type { EditableRecord } from "@/components/admin/homepage/types";

/**
 * Admin → Pages.
 *
 * The client asked for "dynamic sections in admin for About us, Contact,
 * business, live classes page". It is the homepage editor's machinery pointed at
 * a second registry — same cards, same forms, same save — grouped by which page
 * each band belongs to so the editor reads like the site does.
 */
export function PagesClient({ initial }: { initial: EditableRecord[] }) {
  const router = useRouter();
  const [sections, setSections] = useState(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Local state so a toggle lands instantly; the server's copy wins once it
  // catches up. Adjusted during render, not in an effect, so the list never
  // flashes the stale value.
  const [synced, setSynced] = useState(initial);
  if (synced !== initial) {
    setSynced(initial);
    setSections(initial);
  }

  async function toggleVisible(section: EditableRecord, enabled: boolean) {
    setSections((prev) =>
      prev.map((s) => (s.key === section.key ? { ...s, enabled } : s)),
    );
    setBusy(section.key);
    try {
      await api.patch(`/api/pages/${section.key}`, { enabled });
      const spec = PAGE_SECTIONS[section.key as PageSectionKey];
      toast.success(`${spec.label} ${enabled ? "is now live" : "is hidden"}.`);
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

  function renderCard(section: EditableRecord) {
    const key = section.key as PageSectionKey;
    const spec = PAGE_SECTIONS[key];
    const open = editing === section.key;
    const alwaysOn = isPageSectionAlwaysOn(key);

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
          <span className="bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-lg">
            <IconGlyph name={spec.icon} className="size-4" />
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
                  edited {formatDistanceToNow(new Date(section.updatedAt))} ago
                </span>
              )}
            </div>
            <p className="text-muted-foreground mt-0.5 text-sm">{spec.description}</p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {!alwaysOn && (
              <>
                {busy === section.key ? (
                  <Loader2 className="text-muted-foreground size-4 animate-spin" />
                ) : (
                  <Eye className="text-muted-foreground size-4" aria-hidden />
                )}
                <Switch
                  checked={section.enabled}
                  onCheckedChange={(next) => toggleVisible(section, next)}
                  disabled={busy === section.key}
                  aria-label={`Show ${spec.label}`}
                />
              </>
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

        {open && (
          <SectionEditor
            section={section}
            spec={spec}
            endpoint={`/api/pages/${section.key}`}
            maxLengthFor={(path) => maxLengthIn(spec.schema, path)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pages"
        description="Everything written on About us, Contact, For business and Live classes. The homepage has its own editor."
      />

      {PAGE_GROUPS.map((group) => {
        const mine = sections.filter(
          (s) => PAGE_SECTIONS[s.key as PageSectionKey]?.group === group.id,
        );
        if (mine.length === 0) return null;

        return (
          <section key={group.id} className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-heading text-lg">{group.label}</h2>
              <a
                href={group.href}
                target="_blank"
                rel="noreferrer noopener"
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
              >
                View page <ExternalLink className="size-3.5" />
              </a>
            </div>
            <div className="space-y-2">{mine.map(renderCard)}</div>
          </section>
        );
      })}
    </div>
  );
}
