"use client";

import { useCallback, useState, type FormEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
import { format } from "date-fns";
import {
  Plus,
  Search,
  Presentation,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  Send,
  Undo2,
  Users,
  ExternalLink,
  CalendarClock,
  Link2,
  Video,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  WebinarParticipantsSheet,
  type WebinarParticipantsTarget,
} from "@/components/admin/webinars/webinar-participants-sheet";

interface WebinarRow {
  id: string;
  title: string;
  slug: string;
  topic: string;
  agenda: string;
  description: string;
  hostName: string;
  coverImageUrl: string;
  joinUrl: string;
  roomCode: string | null;
  scheduledStart: string;
  durationMinutes: number;
  capacity: number | null;
  attendanceDiscountPercent: number;
  isPublished: boolean;
  registrations: number;
  /** How many sat through the whole session — the discount-eligible count. */
  attended: number;
}
interface Stats {
  total: number;
  published: number;
  upcoming: number;
  registrations: number;
}
interface Query {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
}

const ALL = "all";
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const blank = {
  title: "",
  topic: "",
  agenda: "",
  description: "",
  hostName: "",
  scheduledStart: "",
  durationMinutes: "60",
  coverImageUrl: "",
  joinUrl: "",
  capacity: "",
  attendanceDiscountPercent: "5",
  isPublished: true,
};
type FormState = typeof blank;

export function WebinarsClient({
  webinars,
  total,
  query,
  stats,
}: {
  webinars: WebinarRow[];
  total: number;
  query: Query;
  stats: Stats;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(query.search ?? "");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WebinarRow | null>(null);
  const [form, setForm] = useState<FormState>(blank);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<WebinarRow | null>(null);
  const [participantsFor, setParticipantsFor] = useState<WebinarParticipantsTarget | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));

  const setParams = useCallback(
    (next: Record<string, string | number | undefined>) => {
      const merged = { search: query.search, status: query.status, page: query.page, ...next };
      const p = new URLSearchParams();
      if (merged.search) p.set("search", String(merged.search));
      if (merged.status) p.set("status", String(merged.status));
      if (merged.page && Number(merged.page) > 1) p.set("page", String(merged.page));
      const qs = p.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, query],
  );

  function openCreate() {
    setEditing(null);
    setForm(blank);
    setDialogOpen(true);
  }
  function openEdit(w: WebinarRow) {
    setEditing(w);
    setForm({
      title: w.title,
      topic: w.topic,
      agenda: w.agenda,
      description: w.description,
      hostName: w.hostName,
      scheduledStart: toLocalInput(w.scheduledStart),
      durationMinutes: String(w.durationMinutes),
      coverImageUrl: w.coverImageUrl,
      joinUrl: w.joinUrl,
      capacity: w.capacity != null ? String(w.capacity) : "",
      attendanceDiscountPercent: String(w.attendanceDiscountPercent),
      isPublished: w.isPublished,
    });
    setDialogOpen(true);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      title: form.title,
      topic: form.topic || undefined,
      agenda: form.agenda || undefined,
      description: form.description || undefined,
      hostName: form.hostName,
      scheduledStart: form.scheduledStart,
      durationMinutes: Number(form.durationMinutes),
      coverImageUrl: form.coverImageUrl || undefined,
      joinUrl: form.joinUrl || undefined,
      capacity: form.capacity ? Number(form.capacity) : undefined,
      attendanceDiscountPercent: Number(form.attendanceDiscountPercent || 0),
      isPublished: form.isPublished,
    };
    try {
      if (editing) await api.patch(`/api/webinars/${editing.id}`, payload);
      else await api.post("/api/webinars", payload);
      toast.success(editing ? "Webinar saved." : "Webinar created.");
      setDialogOpen(false);
      router.refresh();
    } catch (err) {
      const d = err instanceof ApiError ? (err.details as { issues?: { message: string }[] }) : undefined;
      toast.error(d?.issues?.[0]?.message ?? (err instanceof ApiError ? err.message : "Couldn't save."));
    } finally {
      setSaving(false);
    }
  }

  /**
   * Issue the webinar's join link. Rather than asking staff to paste a Meet or
   * Zoom URL, this spins up a room on the platform's own video system — so the
   * link is always live, and attendance can be taken from it automatically.
   */
  async function generateLink(w: WebinarRow) {
    setGenerating(w.id);
    try {
      const res = await api.post<{ joinUrl: string }>(`/api/webinars/${w.id}/room`, {});
      const absolute = `${window.location.origin}${res.joinUrl}`;
      try {
        await navigator.clipboard.writeText(absolute);
        toast.success("Join link ready — copied to your clipboard.");
      } catch {
        toast.success(`Join link ready: ${absolute}`);
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't create the join link.");
    } finally {
      setGenerating(null);
    }
  }

  async function copyJoinLink(w: WebinarRow) {
    const absolute = w.joinUrl.startsWith("http")
      ? w.joinUrl
      : `${window.location.origin}${w.joinUrl}`;
    try {
      await navigator.clipboard.writeText(absolute);
      toast.success("Join link copied.");
    } catch {
      toast.error("Couldn't copy — check clipboard permissions.");
    }
  }

  async function togglePublish(w: WebinarRow) {
    try {
      await api.post(`/api/webinars/${w.id}/publish`, { publish: !w.isPublished });
      toast.success(w.isPublished ? "Unpublished." : "Published.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Action failed.");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.del(`/api/webinars/${deleting.id}`);
      toast.success("Webinar deleted.");
      setDeleting(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
    }
  }

  const statCards = [
    { label: "Webinars", value: stats.total, icon: Presentation, tone: "text-rose-500" },
    { label: "Published", value: stats.published, icon: Send, tone: "text-emerald-500" },
    { label: "Upcoming", value: stats.upcoming, icon: CalendarClock, tone: "text-sky-500" },
    { label: "Registrations", value: stats.registrations, icon: Users, tone: "text-violet-500" },
  ];

  function rowActions(w: WebinarRow) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />} aria-label="Actions">
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() =>
              setParticipantsFor({
                id: w.id,
                title: w.title,
                capacity: w.capacity,
                durationMinutes: w.durationMinutes,
              })
            }
          >
            <Users className="size-4" /> Participants ({w.registrations})
          </DropdownMenuItem>
          {w.joinUrl ? (
            <>
              <DropdownMenuItem onClick={() => copyJoinLink(w)}>
                <Link2 className="size-4" /> Copy join link
              </DropdownMenuItem>
              {w.roomCode && (
                <DropdownMenuItem
                  onClick={() => window.open(`/live/room/${w.roomCode}`, "_blank", "noopener")}
                >
                  <Video className="size-4" /> Open webinar room
                </DropdownMenuItem>
              )}
            </>
          ) : (
            <DropdownMenuItem
              disabled={generating === w.id}
              onClick={() => generateLink(w)}
            >
              {generating === w.id ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Video className="size-4" />
              )}
              Generate join link
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => openEdit(w)}>
            <Pencil className="size-4" /> Edit
          </DropdownMenuItem>
          {w.isPublished && (
            <DropdownMenuItem onClick={() => window.open(`/webinars/${w.slug}`, "_blank", "noopener")}>
              <ExternalLink className="size-4" /> View page
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => togglePublish(w)}>
            {w.isPublished ? <Undo2 className="size-4" /> : <Send className="size-4" />}
            {w.isPublished ? "Unpublish" : "Publish"}
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleting(w)}>
            <Trash2 className="size-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const columns: Column<WebinarRow>[] = [
    {
      key: "title",
      header: "Webinar",
      cell: (w) => (
        <button type="button" onClick={() => openEdit(w)} className="min-w-0 text-left">
          <p className="hover:text-primary truncate font-medium transition-colors">{w.title}</p>
          <p className="text-muted-foreground truncate text-xs">by {w.hostName}</p>
        </button>
      ),
    },
    {
      key: "when",
      header: "When",
      cell: (w) => (
        <span className="text-sm whitespace-nowrap">{format(new Date(w.scheduledStart), "d MMM, h:mm a")}</span>
      ),
    },
    {
      key: "regs",
      header: "Participants",
      className: "tabular-nums",
      cell: (w) => (
        <button
          type="button"
          onClick={() =>
            setParticipantsFor({
              id: w.id,
              title: w.title,
              capacity: w.capacity,
              durationMinutes: w.durationMinutes,
            })
          }
          className="hover:text-primary flex items-center gap-1 text-sm transition-colors"
        >
          <Users className="text-muted-foreground size-3.5" />
          {w.registrations}
          {w.capacity != null ? `/${w.capacity}` : ""}
          {w.attended > 0 && (
            <span
              className="ml-1 flex items-center gap-0.5 text-xs text-emerald-600"
              title={`${w.attended} attended the full session`}
            >
              <CheckCircle2 className="size-3" />
              {w.attended}
            </span>
          )}
        </button>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (w) =>
        w.isPublished ? (
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">Published</Badge>
        ) : (
          <Badge variant="secondary" className="bg-muted text-muted-foreground">Draft</Badge>
        ),
    },
    { key: "actions", header: <span className="sr-only">Actions</span>, headerClassName: "w-10", cell: rowActions },
  ];

  const canSave = form.title.trim().length >= 3 && form.hostName.trim().length >= 2 && Boolean(form.scheduledStart);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Webinars"
        description="Create public masterclasses learners can register for."
        actions={
          <Button onClick={openCreate}>
            <Plus className="size-4" /> New webinar
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-3 py-4">
              <div className="bg-muted grid size-10 shrink-0 place-items-center rounded-lg">
                <s.icon className={`size-5 ${s.tone}`} />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-semibold leading-none tabular-nums">{s.value}</p>
                <p className="text-muted-foreground mt-1 truncate text-xs">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <DataTable
        data={webinars}
        columns={columns}
        rowKey={(w) => w.id}
        renderCard={(w) => (
          <div className="rounded-xl border p-4">
            <div className="flex items-start justify-between gap-2">
              <button type="button" onClick={() => openEdit(w)} className="min-w-0 text-left">
                <p className="truncate font-medium">{w.title}</p>
                <p className="text-muted-foreground truncate text-xs">by {w.hostName}</p>
              </button>
              {rowActions(w)}
            </div>
            <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span>{format(new Date(w.scheduledStart), "d MMM, h:mm a")}</span>
              <span className="flex items-center gap-1"><Users className="size-3" /> {w.registrations}</span>
              {!w.isPublished && <Badge variant="secondary" className="text-[10px]">Draft</Badge>}
            </div>
          </div>
        )}
        emptyIcon={Presentation}
        emptyTitle="No webinars yet"
        emptyDescription="Create a public masterclass to grow your audience."
        toolbar={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <form onSubmit={(e) => { e.preventDefault(); setParams({ search: search || undefined, page: 1 }); }} className="relative flex-1">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search webinars…" className="pl-9" />
            </form>
            <Select value={query.status ?? ALL} onValueChange={(v) => setParams({ status: !v || v === ALL ? undefined : v, page: 1 })}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue>{(v) => (!v || v === ALL ? "All statuses" : v === "PUBLISHED" ? "Published" : "Draft")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                <SelectItem value="PUBLISHED">Published</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
        footer={
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">{total} webinars</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={query.page <= 1} onClick={() => setParams({ page: query.page - 1 })}>Previous</Button>
              <span className="text-muted-foreground text-sm">Page {query.page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={query.page >= totalPages} onClick={() => setParams({ page: query.page + 1 })}>Next</Button>
            </div>
          </div>
        }
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit webinar" : "New webinar"}</DialogTitle>
            <DialogDescription>Public masterclass details.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSave} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label htmlFor="w-title">Title</Label>
              <Input id="w-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Break into Data Science in 2026" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="w-topic">Topic</Label>
              <Input
                id="w-topic"
                value={form.topic}
                onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
                placeholder="The one line that says what this session is about"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="w-agenda">Agenda</Label>
              <Textarea
                id="w-agenda"
                rows={4}
                value={form.agenda}
                onChange={(e) => setForm((f) => ({ ...f, agenda: e.target.value }))}
                placeholder={"What gets covered, one point per line:\n• Why medical coding is hiring right now\n• CPC certification, start to finish\n• Live Q&A"}
              />
              <p className="text-muted-foreground text-xs">
                One point per line — shown as a list on the public webinar page.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="w-desc">Description</Label>
              <Textarea id="w-desc" rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="w-host">Presenter</Label>
                <Input id="w-host" value={form.hostName} onChange={(e) => setForm((f) => ({ ...f, hostName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="w-start">Starts</Label>
                <Input id="w-start" type="datetime-local" value={form.scheduledStart} onChange={(e) => setForm((f) => ({ ...f, scheduledStart: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="w-dur">Duration (min)</Label>
                <Input id="w-dur" type="number" value={form.durationMinutes} onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="w-cap">Capacity (optional)</Label>
                <Input id="w-cap" type="number" value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} placeholder="Unlimited" />
                <p className="text-muted-foreground text-xs">
                  Registration closes on the site once these seats are gone.
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="w-disc">Full-attendance discount (%)</Label>
              <Input
                id="w-disc"
                type="number"
                min={0}
                max={100}
                value={form.attendanceDiscountPercent}
                onChange={(e) => setForm((f) => ({ ...f, attendanceDiscountPercent: e.target.value }))}
              />
              <p className="text-muted-foreground text-xs">
                Anyone who stays for the whole session is sent a single-use code
                for this much off any course. Set 0 to switch the offer off.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="w-cover">Cover image URL (optional)</Label>
              <Input id="w-cover" value={form.coverImageUrl} onChange={(e) => setForm((f) => ({ ...f, coverImageUrl: e.target.value }))} placeholder="https://…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="w-join">Join link (optional)</Label>
              <Input id="w-join" value={form.joinUrl} onChange={(e) => setForm((f) => ({ ...f, joinUrl: e.target.value }))} placeholder="Meeting URL shown to registrants" />
              <p className="text-muted-foreground text-xs">
                Leave this blank and use <span className="font-medium">Generate join link</span>{" "}
                from the row menu — that creates a room on our own video system,
                which is what lets attendance be taken automatically.
              </p>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Published</p>
                <p className="text-muted-foreground text-xs">Visible on the public webinars page.</p>
              </div>
              <Switch checked={form.isPublished} onCheckedChange={(v) => setForm((f) => ({ ...f, isPublished: v }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving || !canSave}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                {editing ? "Save" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <WebinarParticipantsSheet
        webinar={participantsFor}
        onOpenChange={(o) => !o && setParticipantsFor(null)}
      />

      <AlertDialog open={deleting != null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleting?.title}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>The webinar and its {deleting?.registrations} registration(s) will be removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
