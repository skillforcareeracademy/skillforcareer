"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Save } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/shared/rich-text-editor";
import { api, ApiError } from "@/lib/api-client";
import {
  LEGAL_PAGES,
  legalPageLabel,
  type LegalPageContent,
} from "@/lib/validations/legal";

/** One page's editable form — header fields plus the rich-text body. */
function LegalForm({ page }: { page: LegalPageContent }) {
  const [title, setTitle] = useState(page.title);
  const [intro, setIntro] = useState(page.intro);
  const [updatedLabel, setUpdatedLabel] = useState(page.updatedLabel);
  const [body, setBody] = useState(page.body);
  const [saving, setSaving] = useState(false);

  const href = LEGAL_PAGES.find((p) => p.key === page.key)?.href ?? "/";

  async function save() {
    if (!title.trim()) {
      toast.error("Give the page a title first.");
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/api/legal/${page.key}`, {
        title,
        intro,
        updatedLabel,
        body,
      });
      toast.success("Saved — the live page is updated.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${page.key}-title`}>Title</Label>
          <Input
            id={`${page.key}-title`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${page.key}-updated`}>&ldquo;Last updated&rdquo; label</Label>
          <Input
            id={`${page.key}-updated`}
            value={updatedLabel}
            onChange={(e) => setUpdatedLabel(e.target.value)}
            placeholder="e.g. 26 October 2026"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${page.key}-intro`}>Intro</Label>
        <Textarea
          id={`${page.key}-intro`}
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          rows={2}
          placeholder="The short line under the page title."
        />
      </div>

      <div className="space-y-1.5">
        <Label>Content</Label>
        <RichTextEditor value={body} onChange={setBody} />
        <p className="text-muted-foreground text-xs">
          Each heading you add becomes an entry in the page&rsquo;s &ldquo;On this
          page&rdquo; list automatically.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={saving} className="gap-1.5">
          <Save className="size-4" />
          {saving ? "Saving…" : "Save changes"}
        </Button>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm underline underline-offset-4"
        >
          View live page <ExternalLink className="size-3.5" />
        </a>
      </div>
    </div>
  );
}

/**
 * Admin → Legal pages. The Privacy, Terms and Cookie documents as editable
 * content — "jitni bhi policy ke pages hain, admin panel se content update kar
 * sakein".
 */
export function LegalClient({ initial }: { initial: LegalPageContent[] }) {
  const first = initial[0]?.key ?? "privacy";
  return (
    <div className="space-y-6">
      <PageHeader
        title="Legal pages"
        description="Edit the Privacy, Terms and Cookie pages shown on the public site. Changes go live as soon as you save."
      />
      <Tabs defaultValue={first}>
        <TabsList>
          {initial.map((p) => (
            <TabsTrigger key={p.key} value={p.key}>
              {legalPageLabel(p.key)}
            </TabsTrigger>
          ))}
        </TabsList>
        {initial.map((p) => (
          <TabsContent key={p.key} value={p.key} className="mt-4">
            <LegalForm page={p} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
