"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  Bell,
  FileEdit,
  Loader2,
  Mail,
  Megaphone,
  Paperclip,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import {
  AUDIENCE_LABEL,
  AUDIENCES_NEEDING_TARGETS,
  EMAIL_ONLY_AUDIENCES,
  type BroadcastAudience,
} from "@/lib/validations/broadcast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FileUpload } from "@/components/shared/file-upload";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { PageHeader } from "@/components/shared/page-header";
import { MultiPicker } from "@/components/admin/groups/multi-picker";

interface Options {
  audiences: BroadcastAudience[];
  roles: { id: string; name: string }[];
  batches: { id: string; name: string }[];
  courses: { id: string; name: string }[];
  candidateStatuses: string[];
}

interface Row {
  id: string;
  title: string;
  message: string;
  actionUrl: string;
  audience: BroadcastAudience;
  targetIds: string[];
  toDashboard: boolean;
  toEmail: boolean;
  fileUrl: string;
  fileName: string;
  isDraft: boolean;
  recipientCount: number;
  notifiedCount: number;
  emailedCount: number;
  sentBy: string;
  createdAt: string;
}

interface Reach {
  total: number;
  withAccounts: number;
  emailOnly: number;
}

const STATUS_LABEL: Record<string, string> = {
  NEW: "New",
  SHORTLISTED: "Shortlisted",
  REFERRED: "Referred",
  INTERVIEWING: "Interviewing",
  PLACED: "Placed",
  NOT_PLACED: "Not placed",
  ON_HOLD: "On hold",
};

/** A word for what the chosen audience picks from — used in the picker label. */
const PICKER_LABEL: Partial<Record<BroadcastAudience, string>> = {
  ROLES: "Roles",
  BATCHES: "Batches",
  COURSES: "Courses",
  USERS: "People",
  PLACEMENT_CANDIDATES: "Only these stages (leave empty for every candidate)",
};

export function BroadcastsClient({ canChooseAll }: { canChooseAll: boolean }) {
  const [options, setOptions] = useState<Options | null>(null);
  const [history, setHistory] = useState<Row[]>([]);
  const [people, setPeople] = useState<{ id: string; name: string; email: string }[]>([]);
  const [search, setSearch] = useState("");

  const [audience, setAudience] = useState<BroadcastAudience>("BATCHES");
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  const [toDashboard, setToDashboard] = useState(true);
  const [toEmail, setToEmail] = useState(false);
  /** A notice or timetable to go out with the message. */
  const [fileUrl, setFileUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [savingDraft, setSavingDraft] = useState(false);
  /** The draft being worked on, if this started life as one. */
  const [draftId, setDraftId] = useState<string | null>(null);

  const [reach, setReach] = useState<Reach | null>(null);
  const [counting, setCounting] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const load = useCallback(async () => {
    try {
      const [opts, sent] = await Promise.all([
        api.get<Options>("/api/broadcasts/options"),
        api.get<{ rows: Row[] }>("/api/broadcasts"),
      ]);
      setOptions(opts);
      setHistory(sent.rows);
      if (opts.audiences.length > 0 && !opts.audiences.includes("BATCHES")) {
        setAudience(opts.audiences[0]);
      }
    } catch {
      toast.error("Couldn't load the broadcast page.");
    }
  }, []);

  // Deferred so the page paints before the loading cascade — the same reason
  // every other panel here fetches on a timer rather than in the effect body.
  useEffect(() => {
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load]);

  // The people picker is searched server-side: the academy has thousands of
  // learners and shipping them all to the browser would be the slow way.
  useEffect(() => {
    if (audience !== "USERS") return;
    const id = setTimeout(() => {
      void api
        .get<{ people: typeof people }>(`/api/broadcasts/people?q=${encodeURIComponent(search)}`)
        .then((r) => setPeople(r.people))
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(id);
  }, [audience, search]);

  // Count the audience whenever the pick changes, so the number on the button
  // is the number that will actually be written.
  useEffect(() => {
    const needsPick = AUDIENCES_NEEDING_TARGETS.includes(audience);
    if (needsPick && targetIds.length === 0) {
      const id = setTimeout(() => setReach(null), 0);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => {
      setCounting(true);
      void api
        .post<Reach>("/api/broadcasts/audience", { audience, targetIds })
        .then(setReach)
        .catch(() => setReach(null))
        .finally(() => setCounting(false));
    }, 300);
    return () => clearTimeout(id);
  }, [audience, targetIds]);

  const pickerOptions = useMemo(() => {
    if (!options) return [];
    switch (audience) {
      case "ROLES":
        return options.roles.map((r) => ({ id: r.id, label: r.name }));
      case "BATCHES":
        return options.batches.map((b) => ({ id: b.id, label: b.name }));
      case "COURSES":
        return options.courses.map((c) => ({ id: c.id, label: c.name }));
      case "USERS":
        return people.map((p) => ({ id: p.id, label: `${p.name} — ${p.email}` }));
      case "PLACEMENT_CANDIDATES":
        return options.candidateStatuses.map((s) => ({ id: s, label: STATUS_LABEL[s] ?? s }));
      default:
        return [];
    }
  }, [audience, options, people]);

  const emailOnlyAudience = EMAIL_ONLY_AUDIENCES.includes(audience);
  const ready =
    title.trim().length > 0 &&
    message.trim().length > 0 &&
    (toDashboard || toEmail) &&
    (!AUDIENCES_NEEDING_TARGETS.includes(audience) || targetIds.length > 0) &&
    (reach?.total ?? 0) > 0;

  function changeAudience(next: BroadcastAudience) {
    setAudience(next);
    setTargetIds([]);
    setReach(null);
    // A partner has no dashboard, so email is the only thing that reaches them.
    if (EMAIL_ONLY_AUDIENCES.includes(next)) setToEmail(true);
  }

  function clearComposer() {
    setTitle("");
    setMessage("");
    setActionUrl("");
    setFileUrl("");
    setFileName("");
    setTargetIds([]);
    setReach(null);
    setDraftId(null);
  }

  /** Put a saved draft back in the composer to finish or send. */
  function openDraft(row: Row) {
    setDraftId(row.id);
    setTitle(row.title);
    setMessage(row.message);
    setActionUrl(row.actionUrl);
    setFileUrl(row.fileUrl);
    setFileName(row.fileName);
    setAudience(row.audience);
    setTargetIds(row.targetIds);
    setToDashboard(row.toDashboard);
    setToEmail(row.toEmail);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function discardDraft(id: string) {
    try {
      await api.del(`/api/broadcasts/${id}`);
      if (draftId === id) clearComposer();
      toast.success("Draft deleted.");
      void load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't delete that.");
    }
  }

  /**
   * Send it, or put it down for later.
   *
   * A draft is stored and reaches nobody — no notice, no mail, no recipients —
   * so the academy can write a long notice over two sittings.
   */
  async function submit(isDraft: boolean) {
    const busy = isDraft ? setSavingDraft : setSending;
    busy(true);
    try {
      const res = await api.post<{ message: string }>("/api/broadcasts", {
        title: title.trim(),
        message: message.trim(),
        actionUrl: actionUrl.trim(),
        fileUrl,
        fileName,
        audience,
        targetIds,
        toDashboard,
        toEmail,
        isDraft,
      });
      // Opening a draft, changing it and saving or sending leaves one row, not
      // two: the old draft is retired once the new one is safely written.
      if (draftId) await api.del(`/api/broadcasts/${draftId}`).catch(() => {});
      toast.success(res.message);
      clearComposer();
      void load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't save that.");
    } finally {
      busy(false);
      setConfirm(false);
    }
  }

  const send = () => submit(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Broadcast"
        description="Send an announcement — a schedule change, an urgent notice — to exactly the people it concerns."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="size-4" /> New message
          </CardTitle>
          <CardDescription>
            {canChooseAll
              ? "Choose who it goes to, then whether it lands on their dashboard, in their inbox, or both."
              : "You can message your own batches, courses and learners."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="broadcast-audience">Send to</Label>
              <Select
                value={audience}
                onValueChange={(v) => changeAudience((v as BroadcastAudience) ?? "BATCHES")}
              >
                <SelectTrigger id="broadcast-audience" className="w-full">
                  <SelectValue>
                    {(v) => AUDIENCE_LABEL[(v as BroadcastAudience) ?? "BATCHES"]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(options?.audiences ?? []).map((a) => (
                    <SelectItem key={a} value={a}>
                      {AUDIENCE_LABEL[a]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Reaches</Label>
              <div className="flex h-9 items-center gap-2">
                {counting ? (
                  <span className="text-muted-foreground flex items-center gap-2 text-sm">
                    <Loader2 className="size-3.5 animate-spin" /> Counting…
                  </span>
                ) : reach ? (
                  <>
                    <Badge variant="default" className="gap-1">
                      <Users className="size-3" /> {reach.total}
                    </Badge>
                    {reach.withAccounts > 0 && (
                      <span className="text-muted-foreground text-xs">
                        {reach.withAccounts} with an account
                      </span>
                    )}
                    {reach.emailOnly > 0 && (
                      <span className="text-muted-foreground text-xs">
                        {reach.emailOnly} by email only
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground text-sm">
                    {AUDIENCES_NEEDING_TARGETS.includes(audience)
                      ? "Pick below to see the count."
                      : "—"}
                  </span>
                )}
              </div>
            </div>
          </div>

          {audience === "USERS" && (
            <div className="space-y-1.5">
              <Label htmlFor="broadcast-search">Find people</Label>
              <Input
                id="broadcast-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email"
              />
            </div>
          )}

          {pickerOptions.length > 0 && (
            <MultiPicker
              label={PICKER_LABEL[audience] ?? "Choose"}
              options={pickerOptions}
              value={targetIds}
              onChange={setTargetIds}
              emptyHint="Nothing to choose from yet."
            />
          )}

          <div className="space-y-1.5">
            <Label htmlFor="broadcast-title">Subject</Label>
            <Input
              id="broadcast-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Class timing changed for tomorrow"
              maxLength={150}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="broadcast-message">Message</Label>
            <Textarea
              id="broadcast-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write what they need to know. Blank lines become paragraphs in the email."
              rows={6}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="broadcast-link">Link (optional)</Label>
            <Input
              id="broadcast-link"
              value={actionUrl}
              onChange={(e) => setActionUrl(e.target.value)}
              placeholder="/student/live"
            />
            <p className="text-muted-foreground text-xs">
              Adds an Open button to the notification and the email.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div className="space-y-0.5">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <Bell className="size-3.5" /> Dashboard
                </p>
                <p className="text-muted-foreground text-xs">
                  {emailOnlyAudience
                    ? "Partners have no dashboard to show it on."
                    : "Shows in their notification bell."}
                </p>
              </div>
              <Switch
                checked={toDashboard && !emailOnlyAudience}
                disabled={emailOnlyAudience}
                onCheckedChange={setToDashboard}
                className="mt-0.5"
              />
            </div>
            <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div className="space-y-0.5">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <Mail className="size-3.5" /> Email
                </p>
                <p className="text-muted-foreground text-xs">
                  Sends after you press Send — large lists take a moment.
                </p>
              </div>
              <Switch checked={toEmail} onCheckedChange={setToEmail} className="mt-0.5" />
            </div>
          </div>

          {/* A file to go with it — a notice, a timetable, a guideline sheet.
              It is sent as a link rather than an attachment: the file is on the
              academy's own storage, and mail servers turn away large ones. */}
          <div className="space-y-1.5">
            <Label>Attach a file</Label>
            <FileUpload
              value={fileUrl}
              onChange={(url, name) => {
                setFileUrl(url);
                setFileName(name ?? "");
              }}
            />
            <p className="text-muted-foreground text-xs">
              Everyone gets a download button, in the notice and the email.
            </p>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              disabled={!title.trim() || !message.trim() || savingDraft || sending}
              onClick={() => void submit(true)}
            >
              {savingDraft && <Loader2 className="size-4 animate-spin" />}
              Save draft
            </Button>
            <Button disabled={!ready || sending || savingDraft} onClick={() => setConfirm(true)}>
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Send{reach?.total ? ` to ${reach.total}` : ""}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Drafts and sent</CardTitle>
          <CardDescription>
            {canChooseAll
              ? "Every broadcast from the panel, with unsent drafts first."
              : "What you have sent, with your unsent drafts first."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Nothing here yet.
            </p>
          ) : (
            <ul className="divide-y">
              {history.map((row) => (
                <li key={row.id} className="space-y-1 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{row.title}</span>
                    {row.isDraft ? (
                      <Badge className="gap-1 bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                        <FileEdit className="size-3" /> Draft
                      </Badge>
                    ) : (
                      <Badge variant="secondary">{AUDIENCE_LABEL[row.audience]}</Badge>
                    )}
                    {row.fileName && (
                      <Badge variant="outline" className="gap-1">
                        <Paperclip className="size-3" /> {row.fileName}
                      </Badge>
                    )}
                    {!row.isDraft && row.toDashboard && (
                      <Badge variant="outline" className="gap-1">
                        <Bell className="size-3" /> {row.notifiedCount}
                      </Badge>
                    )}
                    {!row.isDraft && row.toEmail && (
                      <Badge variant="outline" className="gap-1">
                        <Mail className="size-3" /> {row.emailedCount}
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground line-clamp-2 text-xs">{row.message}</p>
                  {row.isDraft ? (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-muted-foreground text-xs">
                        {row.sentBy} · saved{" "}
                        {formatDistanceToNow(new Date(row.createdAt), { addSuffix: true })}
                      </span>
                      <Button size="sm" variant="outline" onClick={() => openDraft(row)}>
                        <FileEdit className="size-4" /> Open
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void discardDraft(row.id)}
                      >
                        <Trash2 className="size-4" /> Delete
                      </Button>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-xs">
                      {row.sentBy} · {row.recipientCount} recipient
                      {row.recipientCount === 1 ? "" : "s"} ·{" "}
                      {formatDistanceToNow(new Date(row.createdAt), { addSuffix: true })}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send this to {reach?.total ?? 0} people?</AlertDialogTitle>
            <AlertDialogDescription>
              {[
                toDashboard && !emailOnlyAudience
                  ? `${reach?.withAccounts ?? 0} will see it in their notification bell`
                  : "",
                toEmail ? `${reach?.total ?? 0} will be emailed` : "",
              ]
                .filter(Boolean)
                .join(", ")}
              . This can&rsquo;t be unsent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void send()} disabled={sending}>
              {sending ? <Loader2 className="size-4 animate-spin" /> : null}
              Send now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
