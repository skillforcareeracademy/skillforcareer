"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  BookOpen,
  Bookmark,
  BookmarkCheck,
  Download,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import {
  TERM_KINDS,
  TERM_KIND_LABEL,
  TERM_KIND_HINT,
  type TermKind,
} from "@/lib/validations/term";
import type { ImportMode } from "@/lib/validations/import-mode";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/shared/page-header";
import { ImportButton } from "@/components/shared/import-button";
import {
  ImportResultDialog,
  type ImportOutcome,
} from "@/components/shared/import-result-dialog";

/**
 * The academy's dictionary, for both panels.
 *
 * Staff add and edit words here; a learner browses, searches, filters by kind
 * and saves words for later. Which of those is on screen is decided by
 * `canManage`, which the page passes from the server — the API checks the same
 * thing again, so this is about what is worth showing, not about security.
 */

interface Term {
  id: string;
  word: string;
  kind: TermKind;
  synonyms: string[];
  meaning: string;
  explanation: string | null;
  examples: string[];
  isPublished: boolean;
  saved: boolean;
  createdByName: string;
  updatedAt: string;
}

const ALL = "__all";

const blank = {
  word: "",
  kind: "ROOT" as TermKind,
  synonyms: "",
  meaning: "",
  explanation: "",
  examples: "",
  isPublished: true,
};

export function TerminologyClient({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<Term[]>([]);
  const [counts, setCounts] = useState<{ kind: TermKind; count: number }[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<string>(ALL);
  const [savedOnly, setSavedOnly] = useState(false);

  const [form, setForm] = useState<typeof blank | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<Term | null>(null);
  const [importing, setImporting] = useState(false);
  /** What the last sheet did, shown until it is dismissed. */
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ pageSize: "200" });
      if (search.trim()) qs.set("search", search.trim());
      if (kind !== ALL) qs.set("kind", kind);
      if (savedOnly) qs.set("savedOnly", "true");
      const res = await api.get<{
        rows: Term[];
        total: number;
        counts: { kind: TermKind; count: number }[];
      }>(`/api/terms?${qs.toString()}`);
      setRows(res.rows);
      setTotal(res.total);
      setCounts(res.counts);
    } catch {
      toast.error("Couldn't open the dictionary.");
    } finally {
      setLoading(false);
    }
  }, [search, kind, savedOnly]);

  // Deferred, and debounced so typing doesn't fire a request per letter.
  useEffect(() => {
    const id = setTimeout(() => void load(), 250);
    return () => clearTimeout(id);
  }, [load]);

  async function save() {
    if (!form) return;
    setSaving(true);
    const body = {
      ...form,
      synonyms: form.synonyms.split(/[\n,;]/).map((s) => s.trim()).filter(Boolean),
      examples: form.examples.split("\n").map((s) => s.trim()).filter(Boolean),
    };
    try {
      if (editing) {
        await api.patch(`/api/terms/${editing}`, body);
        toast.success("Saved.");
      } else {
        const res = await api.post<{ message: string }>("/api/terms", body);
        toast.success(res.message);
      }
      setForm(null);
      setEditing(null);
      void load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(term: Term) {
    try {
      await api.del(`/api/terms/${term.id}`);
      toast.success(`“${term.word}” deleted.`);
      void load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't delete that.");
    } finally {
      setRemoving(null);
    }
  }

  async function toggleSave(term: Term) {
    // Flipped straight away: a bookmark that waits for the server feels broken.
    setRows((r) => r.map((x) => (x.id === term.id ? { ...x, saved: !x.saved } : x)));
    try {
      const res = await api.post<{ saved: boolean }>(`/api/terms/${term.id}/bookmark`);
      setRows((r) => r.map((x) => (x.id === term.id ? { ...x, saved: res.saved } : x)));
    } catch {
      setRows((r) => r.map((x) => (x.id === term.id ? { ...x, saved: term.saved } : x)));
      toast.error("Couldn't save that word.");
    }
  }

  async function onImport(file: File, mode: ImportMode) {
    setImporting(true);
    try {
      const res = await api.post<ImportOutcome & { message: string }>(
        `/api/terms/import?mode=${mode}`,
        await file.text(),
        { "Content-Type": "text/csv" },
      );
      // Always the full account, not a toast: a sheet of a thousand words that
      // lands 600 needs to say which 400 and why.
      setOutcome(res);
      void load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't read that sheet.");
    } finally {
      setImporting(false);
    }
  }

  function edit(term: Term) {
    setEditing(term.id);
    setForm({
      word: term.word,
      kind: term.kind,
      synonyms: term.synonyms.join(", "),
      meaning: term.meaning,
      explanation: term.explanation ?? "",
      examples: term.examples.join("\n"),
      isPublished: term.isPublished,
    });
  }

  return (
    <div className="space-y-6">
      <ImportResultDialog
        outcome={outcome}
        onClose={() => setOutcome(null)}
        noun="words"
      />
      <PageHeader
        title="Terminology"
        description={
          canManage
            ? "The academy's dictionary — every term, what it means, and where it comes from."
            : "Look up any term you meet in the reading, and save the ones worth coming back to."
        }
        actions={
          canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="outline">
                      <Download className="size-4" /> Export
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    render={
                      <a href="/api/terms/export" download>
                        Everything in the dictionary
                      </a>
                    }
                  />
                  <DropdownMenuSeparator />
                  {/* The label has to sit inside a group — Base UI throws
                      "MenuGroupContext is missing" otherwise. */}
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Blank sample sheet</DropdownMenuLabel>
                    <DropdownMenuItem
                      render={
                        <a href="/api/terms/export?sample=1" download>
                          One of every kind
                        </a>
                      }
                    />
                    {TERM_KINDS.map((k) => (
                      <DropdownMenuItem
                        key={k}
                        render={
                          <a href={`/api/terms/export?sample=1&kind=${k}`} download>
                            {TERM_KIND_LABEL[k]} only
                          </a>
                        }
                      />
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <ImportButton
                busy={importing}
                onImport={onImport}
                title="Import terminology"
                description="Rows are matched on the word and its kind. Choose what should happen when a word is already here."
              />
              <Button onClick={() => { setEditing(null); setForm({ ...blank }); }}>
                <Plus className="size-4" /> Add a word
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search a word or its meaning…"
            className="pl-9"
          />
        </div>
        <Select value={kind} onValueChange={(v) => setKind(v ?? ALL)}>
          <SelectTrigger className="w-52">
            <SelectValue>
              {(v) =>
                !v || v === ALL ? "Every kind" : (TERM_KIND_LABEL[v as TermKind] ?? "Every kind")
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Every kind</SelectItem>
            {counts.map((c) => (
              <SelectItem key={c.kind} value={c.kind}>
                {TERM_KIND_LABEL[c.kind]} ({c.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={savedOnly ? "default" : "outline"}
          onClick={() => setSavedOnly((s) => !s)}
        >
          {savedOnly ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
          My words
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground flex items-center justify-center gap-2 py-12 text-sm">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </p>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="text-muted-foreground mx-auto mb-3 size-8" />
            <p className="text-sm font-medium">
              {savedOnly ? "You haven't saved any words yet." : "No words here yet."}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {canManage
                ? "Add one, or import a sheet."
                : "Double-tap a word while reading to look it up."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-muted-foreground text-xs">
            {total} word{total === 1 ? "" : "s"}
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((t) => (
              <Card key={t.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{t.word}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {TERM_KIND_LABEL[t.kind]}
                      </Badge>
                      {canManage && !t.isPublished && (
                        <Badge variant="outline" className="text-[10px]">
                          Hidden
                        </Badge>
                      )}
                    </p>
                    <p className="mt-1 text-sm">{t.meaning}</p>
                    {t.explanation && (
                      <p className="text-muted-foreground mt-1 text-xs">{t.explanation}</p>
                    )}
                    {t.synonyms.length > 0 && (
                      <p className="text-muted-foreground mt-1 text-xs">
                        Also: {t.synonyms.join(", ")}
                      </p>
                    )}
                    {t.examples.length > 0 && (
                      <ul className="text-muted-foreground mt-1 list-disc space-y-0.5 pl-4 text-xs">
                        {t.examples.map((ex) => (
                          <li key={ex}>{ex}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => void toggleSave(t)}
                      aria-label={t.saved ? "Remove from your words" : "Save for later"}
                    >
                      {t.saved ? (
                        <BookmarkCheck className="text-primary size-4" />
                      ) : (
                        <Bookmark className="size-4" />
                      )}
                    </Button>
                    {canManage && (
                      <>
                        <Button size="icon-sm" variant="ghost" onClick={() => edit(t)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setRemoving(t)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <Dialog open={form !== null} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit the word" : "Add a word"}</DialogTitle>
            <DialogDescription>
              The one-line meaning is what a learner sees when they tap the word
              while reading. Everything else shows on its own card.
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="term-word">Word</Label>
                  <Input
                    id="term-word"
                    value={form.word}
                    onChange={(e) => setForm({ ...form, word: e.target.value })}
                    placeholder="cardi/o"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Kind</Label>
                  <Select
                    value={form.kind}
                    onValueChange={(v) => v && setForm({ ...form, kind: v as TermKind })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(v) => TERM_KIND_LABEL[(v as TermKind) ?? "ROOT"]}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {TERM_KINDS.map((k) => (
                        <SelectItem key={k} value={k}>
                          {TERM_KIND_LABEL[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-muted-foreground text-xs">
                    {TERM_KIND_HINT[form.kind]}
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="term-meaning">One-line meaning</Label>
                <Input
                  id="term-meaning"
                  value={form.meaning}
                  onChange={(e) => setForm({ ...form, meaning: e.target.value })}
                  placeholder="Relating to the heart."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="term-explanation">Detailed explanation</Label>
                <Textarea
                  id="term-explanation"
                  value={form.explanation}
                  onChange={(e) => setForm({ ...form, explanation: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="term-synonyms">Synonyms</Label>
                <Input
                  id="term-synonyms"
                  value={form.synonyms}
                  onChange={(e) => setForm({ ...form, synonyms: e.target.value })}
                  placeholder="cardiac, heart"
                />
                <p className="text-muted-foreground text-xs">
                  Separated by commas. A learner who taps a synonym finds this entry.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="term-examples">Examples</Label>
                <Textarea
                  id="term-examples"
                  value={form.examples}
                  onChange={(e) => setForm({ ...form, examples: e.target.value })}
                  rows={3}
                  placeholder={"carditis — inflammation of the heart\ncardiomegaly — an enlarged heart"}
                />
                <p className="text-muted-foreground text-xs">One per line.</p>
              </div>
              <label className="flex items-center justify-between gap-4 text-sm">
                <span>Visible to learners</span>
                <Switch
                  checked={form.isPublished}
                  onCheckedChange={(v) => setForm({ ...form, isPublished: v })}
                />
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{removing?.word}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              It goes from the dictionary and from anyone&apos;s saved words.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => removing && void remove(removing)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
