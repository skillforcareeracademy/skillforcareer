"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Bot,
  GraduationCap,
  HelpCircle,
  Loader2,
  MessageCircleQuestion,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { findBestMatch } from "@/lib/chatbot/match";
import type {
  AdminIntent,
  ChatbotBoard,
} from "@/server/services/chatbot-service";

/**
 * Admin → Assistant: where Ami is trained.
 *
 * Two halves. "Answers" is the knowledge base staff write. "Teach Ami" is the
 * queue of what visitors actually asked and Ami couldn't answer — one click
 * turns any of those into a new answer with the question already filled in,
 * which is the loop that makes the assistant worth having.
 */

interface FormState {
  question: string;
  patterns: string;
  answer: string;
  actionLabel: string;
  actionUrl: string;
  category: string;
  isSuggested: boolean;
  isActive: boolean;
}

const EMPTY: FormState = {
  question: "",
  patterns: "",
  answer: "",
  actionLabel: "",
  actionUrl: "",
  category: "",
  isSuggested: false,
  isActive: true,
};

function toForm(intent: AdminIntent): FormState {
  return {
    question: intent.question,
    patterns: intent.patterns.join("\n"),
    answer: intent.answer,
    actionLabel: intent.actionLabel ?? "",
    actionUrl: intent.actionUrl ?? "",
    category: intent.category ?? "",
    isSuggested: intent.isSuggested,
    isActive: intent.isActive,
  };
}

export function ChatbotClient({
  board,
  assistantName,
}: {
  board: ChatbotBoard;
  assistantName: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdminIntent | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<AdminIntent | null>(null);
  const [test, setTest] = useState("");

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const intents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return board.intents;
    return board.intents.filter(
      (i) =>
        i.question.toLowerCase().includes(q) ||
        i.answer.toLowerCase().includes(q) ||
        i.patterns.some((p) => p.toLowerCase().includes(q)),
    );
  }, [board.intents, search]);

  /**
   * The same matcher the server runs, so "try it" here answers exactly as the
   * widget will. That's the point of keeping `lib/chatbot/match` client-safe.
   */
  const testResult = useMemo(() => {
    if (!test.trim()) return null;
    return findBestMatch(
      test,
      board.intents
        .filter((i) => i.isActive)
        .map((i) => ({
          id: i.id,
          question: i.question,
          patterns: i.patterns,
          answer: i.answer,
        })),
    );
  }, [test, board.intents]);

  function openNew(question = "") {
    setEditing(null);
    setForm({ ...EMPTY, question });
    setDialogOpen(true);
  }

  function openEdit(intent: AdminIntent) {
    setEditing(intent);
    setForm(toForm(intent));
    setDialogOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      question: form.question,
      patterns: form.patterns
        .split("\n")
        .map((p) => p.trim())
        .filter(Boolean),
      answer: form.answer,
      actionLabel: form.actionLabel || undefined,
      actionUrl: form.actionUrl || undefined,
      category: form.category || undefined,
      isSuggested: form.isSuggested,
      isActive: form.isActive,
    };
    try {
      if (editing) {
        await api.patch(`/api/chatbot/intents/${editing.id}`, payload);
        toast.success("Answer updated.");
      } else {
        await api.post("/api/chatbot/intents", payload);
        toast.success(`${assistantName} has learnt that.`);
      }
      setDialogOpen(false);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const d = err.details as { issues?: { message: string }[] } | undefined;
        toast.error(d?.issues?.[0]?.message ?? err.message);
      } else toast.error("Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!deleting) return;
    try {
      await api.del(`/api/chatbot/intents/${deleting.id}`);
      toast.success("Answer removed.");
      setDeleting(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't remove it.");
    }
  }

  async function dismiss(id: string) {
    try {
      await api.del(`/api/chatbot/unanswered/${id}`);
      router.refresh();
    } catch {
      toast.error("Couldn't clear that.");
    }
  }

  const canSave = form.question.trim().length >= 3 && form.answer.trim().length >= 2;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${assistantName} — the site assistant`}
        description="Everything Ami says is something you wrote here. Nothing is generated."
        actions={
          <Button onClick={() => openNew()}>
            <Plus className="size-4" /> New answer
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Answers" value={board.stats.intents} icon={Bot} />
        <StatCard
          label="Live"
          value={board.stats.active}
          icon={Sparkles}
          tint="from-emerald-500 to-teal-600"
        />
        <StatCard
          label="Questions answered"
          value={board.stats.answered}
          icon={MessageCircleQuestion}
          tint="from-sky-500 to-indigo-600"
        />
        <StatCard
          label="Waiting to be taught"
          value={board.stats.unanswered}
          icon={HelpCircle}
          tint="from-amber-500 to-orange-600"
        />
      </div>

      <Tabs defaultValue="answers">
        <TabsList>
          <TabsTrigger value="answers">
            Answers
            <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">
              {board.intents.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="teach">
            Teach {assistantName}
            {board.unanswered.length > 0 && (
              <Badge className="ml-1.5 h-5 bg-amber-500 px-1.5 text-[10px] text-white">
                {board.unanswered.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── The knowledge base ─────────────────────────────────────────── */}
        <TabsContent value="answers" className="mt-6 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search answers…"
                className="pl-9"
              />
            </div>
            <div className="relative flex-1">
              <Sparkles className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                value={test}
                onChange={(e) => setTest(e.target.value)}
                placeholder="Try a question the way a visitor would ask it…"
                className="pl-9"
              />
            </div>
          </div>

          {test.trim() && (
            <Card
              className={
                testResult
                  ? "border-emerald-500/40"
                  : "border-amber-500/40"
              }
            >
              <CardContent className="space-y-1.5">
                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  {testResult
                    ? `${assistantName} would answer (confidence ${Math.round(testResult.score * 100)}%)`
                    : `${assistantName} doesn't know this yet`}
                </p>
                {testResult ? (
                  <>
                    <p className="text-sm">{testResult.intent.answer}</p>
                    <p className="text-muted-foreground text-xs">
                      Matched: “{testResult.intent.question}”
                    </p>
                  </>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-muted-foreground text-sm">
                      It would go into the teach queue.
                    </p>
                    <Button size="sm" variant="outline" onClick={() => openNew(test)}>
                      <GraduationCap className="size-4" /> Teach it now
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {intents.length === 0 ? (
            <EmptyState
              icon={Bot}
              title={search ? "Nothing matches that search" : `${assistantName} knows nothing yet`}
              description={
                search
                  ? "Try a different word."
                  : "Add the questions your counsellors answer on the phone all day — fees, batches, placement, refunds."
              }
            />
          ) : (
            <div className="space-y-3">
              {intents.map((intent) => (
                <Card key={intent.id}>
                  <CardContent className="space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{intent.question}</p>
                        <p className="text-muted-foreground mt-1 line-clamp-3 text-sm">
                          {intent.answer}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {!intent.isActive && (
                          <Badge variant="secondary" className="mr-1">
                            Off
                          </Badge>
                        )}
                        {intent.isSuggested && (
                          <Badge variant="secondary" className="mr-1">
                            Starter chip
                          </Badge>
                        )}
                        <Badge variant="secondary">{intent.hits} asked</Badge>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openEdit(intent)}
                          aria-label={`Edit “${intent.question}”`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setDeleting(intent)}
                          aria-label={`Delete “${intent.question}”`}
                        >
                          <Trash2 className="text-destructive size-4" />
                        </Button>
                      </div>
                    </div>
                    {intent.patterns.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {intent.patterns.slice(0, 8).map((p) => (
                          <span
                            key={p}
                            className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs"
                          >
                            {p}
                          </span>
                        ))}
                        {intent.patterns.length > 8 && (
                          <span className="text-muted-foreground text-xs">
                            +{intent.patterns.length - 8} more
                          </span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── What nobody has answered yet ───────────────────────────────── */}
        <TabsContent value="teach" className="mt-6">
          {board.unanswered.length === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title="Nothing waiting"
              description={`Every question visitors have asked, ${assistantName} could answer. Anything new turns up here.`}
            />
          ) : (
            <div className="space-y-3">
              <p className="text-muted-foreground text-sm">
                Real questions visitors asked that {assistantName} couldn&apos;t answer.
                Teaching one writes it into the answers above.
              </p>
              {board.unanswered.map((q) => (
                <Card key={q.id}>
                  <CardContent className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{q.text}</p>
                      <p className="text-muted-foreground text-xs">
                        {q.userName ? `${q.userName} · ` : ""}
                        {format(new Date(q.askedAt), "d MMM yyyy, h:mm a")}
                        {q.count > 1 && ` · asked ${q.count} times`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button size="sm" onClick={() => openNew(q.text)}>
                        <GraduationCap className="size-4" /> Teach
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => dismiss(q.id)}
                        aria-label="Dismiss"
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── The editor ──────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit answer" : `Teach ${assistantName}`}</DialogTitle>
            <DialogDescription>
              Write it the way a counsellor would say it on the phone.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ci-q">The question</Label>
              <Input
                id="ci-q"
                value={form.question}
                onChange={(e) => set("question", e.target.value)}
                placeholder="What are the fees for the data science course?"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ci-a">The answer</Label>
              <Textarea
                id="ci-a"
                value={form.answer}
                onChange={(e) => set("answer", e.target.value)}
                rows={4}
                placeholder="The Data Science programme is ₹49,999, with zero-cost EMI from ₹4,167 a month…"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ci-p">Other ways people ask it</Label>
              <Textarea
                id="ci-p"
                value={form.patterns}
                onChange={(e) => set("patterns", e.target.value)}
                rows={4}
                placeholder={"One per line, e.g.\nfees kitni hai\ncourse price\nhow much does it cost"}
              />
              <p className="text-muted-foreground text-xs">
                One phrasing per line. A single word on its own line (like
                &ldquo;refund&rdquo;) is treated as a keyword and will match on its own.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ci-al">Button text</Label>
                <Input
                  id="ci-al"
                  value={form.actionLabel}
                  onChange={(e) => set("actionLabel", e.target.value)}
                  placeholder="See courses"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ci-au">Button links to</Label>
                <Input
                  id="ci-au"
                  value={form.actionUrl}
                  onChange={(e) => set("actionUrl", e.target.value)}
                  placeholder="/courses"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ci-cat">Group</Label>
              <Input
                id="ci-cat"
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                placeholder="Fees"
              />
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.isSuggested}
                  onCheckedChange={(v) => set("isSuggested", v)}
                />
                Offer this as a starter chip when the chat opens
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(v) => set("isActive", v)}
                />
                Live
              </label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSave || saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                {editing ? "Save" : "Teach it"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this answer?</AlertDialogTitle>
            <AlertDialogDescription>
              {assistantName} will stop answering “{deleting?.question}”. Past
              conversations are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
