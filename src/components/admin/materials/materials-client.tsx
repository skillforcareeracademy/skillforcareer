"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Download,
  Eye,
  EyeOff,
  FileText,
  Check,
  ChevronRight,
  FolderTree,
  Image as ImageIcon,
  Link as LinkIcon,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Rows3,
  Trash2,
  Upload,
  Users,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type {
  MaterialRow,
  MaterialStats,
} from "@/server/services/study-material-service";
import type { GroupOption } from "@/server/services/content-group-service";
import { GroupPicker } from "@/components/admin/groups/group-picker";
import { MultiPicker } from "@/components/admin/groups/multi-picker";
import { FolderSelect } from "@/components/admin/groups/folder-select";
import { PageHeader } from "@/components/shared/page-header";
import { StatCards } from "@/components/shared/stat-cards";
import { ExportDialog } from "@/components/shared/export-dialog";
import { ImportButton } from "@/components/shared/import-button";
import { RelatedContent } from "@/components/shared/related-content";
import type { ImportMode } from "@/lib/validations/import-mode";
import {
  MATERIAL_EXPORT_COLUMNS,
  DEFAULT_MATERIAL_COLUMNS,
  MATERIAL_SAMPLE_KINDS,
  MATERIAL_SAMPLE_LABEL,
} from "@/lib/validations/study-material";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/shared/rich-text-editor";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * Study material, as the academy manages it.
 *
 * Deliberately the quiz screen's twin: the same grouping, the same permanent
 * number beside a rearrangeable order, the same audience choice, the same
 * import and export. What is new is the reading column — who has opened a piece
 * and for how long — and the switch that lets a document be read without being
 * saved.
 */

const ALL = "__all";

interface CourseOption {
  id: string;
  title: string;
}
interface BatchOption {
  id: string;
  name: string;
}

/** A file, image, video or link attached to a piece of reading. */
interface Asset {
  kind: "FILE" | "IMAGE" | "VIDEO" | "LINK";
  url: string;
  name: string;
  mimeType?: string;
}

interface FormState {
  id: string | null;
  title: string;
  description: string;
  /** Every course it is set for; the first is the primary one. */
  courseIds: string[];
  /** Every folder it is filed in. */
  groupIds: string[];
  assets: Asset[];
  body: string;
  downloadsEnabled: boolean;
  isPublished: boolean;
  batchIds: string[];
}

function blankForm(): FormState {
  return {
    id: null,
    title: "",
    description: "",
    courseIds: [],
    groupIds: [],
    assets: [],
    body: "",
    downloadsEnabled: true,
    isPublished: false,
    batchIds: [],
  };
}

function readable(seconds: number): string {
  if (seconds <= 0) return "—";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

export function MaterialsClient({
  materials,
  stats,
  groups,
  courses,
  batches,
  basePath,
}: {
  materials: MaterialRow[];
  stats: MaterialStats;
  groups: GroupOption[];
  courses: CourseOption[];
  batches: BatchOption[];
  /** "/admin" or "/instructor" — the panel this is mounted in. */
  basePath: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL);
  const [course, setCourse] = useState(ALL);
  const [batch, setBatch] = useState(ALL);
  const [published, setPublished] = useState(ALL);
  /** Behind the Documents figure: material with a file attached. */
  const [kindFilter, setKindFilter] = useState(ALL);
  /** Which piece is having its text fetched before the editor opens. */
  const [loadingEdit, setLoadingEdit] = useState<string | null>(null);
  /** Which attachment is being renamed or re-pointed, by index. */
  const [editingAsset, setEditingAsset] = useState<number | null>(null);

  const hasFilters =
    Boolean(search) ||
    category !== ALL ||
    course !== ALL ||
    batch !== ALL ||
    published !== ALL ||
    kindFilter !== ALL;

  function clearFilters() {
    setSearch("");
    setCategory(ALL);
    setCourse(ALL);
    setBatch(ALL);
    setPublished(ALL);
    setKindFilter(ALL);
  }
  const [sort, setSort] = useState<"sequence" | "newest" | "title" | "reads">(
    "sequence",
  );
  /** "Content should be visible in folder format", beside the plain table. */
  const [view, setView] = useState<"folders" | "table">("folders");
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<MaterialRow | null>(null);
  const [moving, setMoving] = useState(false);
  const [readersOf, setReadersOf] = useState<MaterialRow | null>(null);
  const [readers, setReaders] = useState<
    {
      userId: string;
      name: string;
      email: string;
      opens: number;
      seconds: number;
      downloads: number;
    }[]
  >([]);
  const [importing, setImporting] = useState(false);

  const groupPath = useCallback(
    (id: string | undefined | null) =>
      groups.find((g) => g.id === id)?.path ?? "",
    [groups],
  );
  const courseLabel = (id: string | undefined | null) =>
    courses.find((c) => c.id === id)?.title ?? "";
  const batchLabel = (id: string | undefined | null) =>
    batches.find((b) => b.id === id)?.name ?? "";

  // Filtering and sorting happen here so the table reacts as you type; the
  // server does the same for the export and for a deep link.
  const rows = useMemo(() => {
    let list = materials;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          m.groupPaths.some((p) => p.toLowerCase().includes(q)) ||
          m.courseTitles.some((t) => t.toLowerCase().includes(q)),
      );
    }
    if (category !== ALL) {
      // A folder shows what is filed in it and in anything beneath it.
      const under = new Set(
        groups
          .filter(
            (g) =>
              g.id === category ||
              g.path.startsWith(`${groupPath(category)} → `),
          )
          .map((g) => g.id),
      );
      list = list.filter((m) => m.groupIds.some((id) => under.has(id)));
    }
    if (course !== ALL) list = list.filter((m) => m.courseIds.includes(course));
    if (batch !== ALL) list = list.filter((m) => m.batchIds.includes(batch));
    if (kindFilter === "file") {
      list = list.filter((m) => Boolean(m.fileUrl) || m.assets.length > 0);
    }
    if (published !== ALL) {
      list = list.filter((m) =>
        published === "yes" ? m.isPublished : !m.isPublished,
      );
    }
    const sorted = [...list];
    if (sort === "newest")
      sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    else if (sort === "title")
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "reads")
      sorted.sort((a, b) => b.readSeconds - a.readSeconds);
    return sorted;
  }, [
    materials,
    search,
    category,
    course,
    batch,
    published,
    kindFilter,
    sort,
    groups,
    groupPath,
  ]);

  /** The filtered rows, gathered under the folders they are filed in. */
  const folders = useMemo(() => {
    const map = new Map<string, MaterialRow[]>();
    for (const m of rows) {
      const paths = m.groupPaths.length ? m.groupPaths : ["Ungrouped"];
      for (const path of paths) {
        map.set(path, [...(map.get(path) ?? []), m]);
      }
    }
    return [...map.entries()].sort(([a], [b]) =>
      a === "Ungrouped" ? 1 : b === "Ungrouped" ? -1 : a.localeCompare(b),
    );
  }, [rows]);

  const bySequence = sort === "sequence";
  const sameGroup = (a: MaterialRow, b: MaterialRow) =>
    (a.categoryId ?? "") === (b.categoryId ?? "") &&
    (a.subCategoryId ?? "") === (b.subCategoryId ?? "");

  /** What kind of attachment a file is, from its own mime type. */
  function kindOf(mime: string): Asset["kind"] {
    if (mime.startsWith("image/")) return "IMAGE";
    if (mime.startsWith("video/")) return "VIDEO";
    return "FILE";
  }

  /**
   * Upload one or many — "multiple files, images and all can be uploaded here.
   * videos here." Each lands as its own attachment, in the order they were
   * chosen, and a failure on one doesn't lose the rest.
   */
  async function upload(files: FileList | null) {
    if (!files || files.length === 0 || !form) return;
    setUploading(true);
    const added: Asset[] = [];
    try {
      for (const file of Array.from(files)) {
        const isImage = file.type.startsWith("image/");
        const isVideo = file.type.startsWith("video/");
        const cap = isImage ? 5 : isVideo ? 200 : 25;
        if (file.size > cap * 1024 * 1024) {
          toast.error(`${file.name} is over ${cap} MB.`);
          continue;
        }
        const fd = new FormData();
        fd.append("file", file);
        fd.append("kind", isImage ? "image" : isVideo ? "video" : "doc");
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          toast.error(
            `${file.name}: ${json?.error?.message ?? "upload failed"}`,
          );
          continue;
        }
        added.push({
          kind: kindOf(file.type),
          url: json.data.url as string,
          name: file.name,
          mimeType: file.type,
        });
      }
      if (added.length > 0) {
        setForm((f) =>
          f
            ? {
                ...f,
                assets: [...f.assets, ...added],
                title: f.title || added[0].name.replace(/\.[^.]+$/, ""),
              }
            : f,
        );
        toast.success(
          `${added.length} file${added.length === 1 ? "" : "s"} attached.`,
        );
      }
    } finally {
      setUploading(false);
    }
  }

  /** A link out — a recording, a reference, anything already on the web. */
  function addLink() {
    const url = window.prompt("Paste the link")?.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      toast.error("A link should start with http:// or https://");
      return;
    }
    const name = window.prompt("What should it be called?")?.trim() || url;
    setForm((f) =>
      f ? { ...f, assets: [...f.assets, { kind: "LINK", url, name }] } : f,
    );
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (form.assets.length === 0 && !form.body.trim()) {
      toast.error(
        "Attach a file or a link, or write the reading in the panel.",
      );
      return;
    }
    setSaving(true);
    try {
      // The first attachment stays on the row as the main file — the learner's
      // download button and the "kind" column both read it — and the rest ride
      // alongside it.
      const [first, ...rest] = form.assets;
      const payload = {
        title: form.title,
        description: form.description,
        courseId: form.courseIds[0] ?? "",
        courseIds: form.courseIds,
        groupIds: form.groupIds,
        fileUrl: first && first.kind !== "LINK" ? first.url : "",
        fileName: first && first.kind !== "LINK" ? first.name : "",
        mimeType: first?.mimeType ?? "",
        assets: (first?.kind === "LINK" ? form.assets : rest).map((a) => ({
          kind: a.kind,
          url: a.url,
          name: a.name,
          mimeType: a.mimeType ?? "",
        })),
        body: form.body,
        downloadsEnabled: form.downloadsEnabled,
        isPublished: form.isPublished,
        batchIds: form.batchIds,
      };
      if (form.id) {
        await api.patch(`/api/materials/${form.id}`, payload);
        toast.success("Material updated.");
      } else {
        await api.post("/api/materials", payload);
        toast.success("Material saved.");
      }
      setForm(null);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Couldn't save that.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function togglePublished(m: MaterialRow) {
    try {
      await api.patch(`/api/materials/${m.id}/publish`, {
        isPublished: !m.isPublished,
      });
      toast.success(m.isPublished ? "Hidden from learners." : "Published.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Action failed.");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.del(`/api/materials/${deleting.id}`);
      toast.success("Material deleted.");
      setDeleting(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
    }
  }

  /** Swap with a neighbour in the same group and renumber the whole group. */
  async function move(index: number, delta: number) {
    const to = index + delta;
    if (to < 0 || to >= rows.length || moving) return;
    if (!sameGroup(rows[index], rows[to])) return;

    const group = rows.filter((m) => sameGroup(m, rows[index]));
    const from = group.findIndex((m) => m.id === rows[index].id);
    const target = group.findIndex((m) => m.id === rows[to].id);
    const ids = group.map((m) => m.id);
    [ids[from], ids[target]] = [ids[target], ids[from]];

    setMoving(true);
    try {
      await api.patch("/api/materials/reorder", { ids });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't reorder.");
    } finally {
      setMoving(false);
    }
  }

  async function openReaders(m: MaterialRow) {
    setReadersOf(m);
    setReaders([]);
    try {
      const res = await api.get<{ readers: typeof readers }>(
        `/api/materials/${m.id}/readers`,
      );
      setReaders(res.readers);
    } catch {
      toast.error("Couldn't load who has read it.");
    }
  }

  /**
   * Open a piece for editing, with its text.
   *
   * The list rows do not carry the body — a library of chapters would be
   * megabytes — so it is fetched here. It used to open blank, which both hid
   * the text and, because a blank body saves as "no text", wiped it on the
   * next save.
   */
  async function openEdit(m: MaterialRow) {
    const base = {
      id: m.id,
      title: m.title,
      description: m.description ?? "",
      courseIds: m.courseIds,
      groupIds: m.groupIds,
      // The old single file is the first attachment; anything else added
      // since follows it.
      assets: [
        ...(m.fileUrl
          ? [
              {
                kind: "FILE" as const,
                url: m.fileUrl,
                name: m.fileName ?? "",
                mimeType: m.mimeType ?? undefined,
              },
            ]
          : []),
        ...m.assets.map((a) => ({
          kind: a.kind as Asset["kind"],
          url: a.url,
          name: a.name ?? "",
          mimeType: a.mimeType ?? undefined,
        })),
      ],
      body: "",
      downloadsEnabled: m.downloadsEnabled,
      isPublished: m.isPublished,
      batchIds: m.batchIds,
    };
    // Fetched *before* the dialog opens: the editor takes its content when it
    // mounts, so arriving with the text a moment later would leave it blank.
    setLoadingEdit(m.id);
    try {
      const res = await api.get<{ material: { body: string | null } }>(
        `/api/materials/${m.id}`,
      );
      setForm({ ...base, body: res.material.body ?? "" });
    } catch {
      toast.error("Couldn't load that one — try again.");
    } finally {
      setLoadingEdit(null);
    }
  }

  async function onImport(file: File, mode: ImportMode) {
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      // The mode decides what happens to a piece of the same name.
      const res = await fetch(`/api/materials/import?mode=${mode}`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success)
        throw new Error(json?.error?.message ?? "Import failed.");
      toast.success(json.data.message as string);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  const columns: Column<MaterialRow>[] = [
    {
      key: "number",
      header: "No.",
      className: "w-16",
      cell: (m) => (
        <span className="text-muted-foreground text-sm tabular-nums">
          {m.number}
        </span>
      ),
    },
    {
      key: "sequence",
      header: "Order",
      className: "w-28",
      cell: (m) => {
        const i = rows.indexOf(m);
        return (
          <div className="flex items-center gap-0.5">
            <span className="text-muted-foreground w-5 text-sm tabular-nums">
              {m.sequence}
            </span>
            {bySequence && (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={moving || i - 1 < 0 || !sameGroup(m, rows[i - 1])}
                  onClick={() => move(i, -1)}
                  aria-label={`Move ${m.title} up`}
                >
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={
                    moving || i + 1 >= rows.length || !sameGroup(m, rows[i + 1])
                  }
                  onClick={() => move(i, 1)}
                  aria-label={`Move ${m.title} down`}
                >
                  <ArrowDown className="size-3.5" />
                </Button>
              </>
            )}
          </div>
        );
      },
    },
    {
      key: "title",
      header: "Material",
      cell: (m) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{m.title}</p>
          <p className="text-muted-foreground truncate text-xs">
            {m.groupPaths.length ? m.groupPaths.join(" · ") : "Ungrouped"}
            {m.courseTitles.length ? ` · ${m.courseTitles.join(", ")}` : ""}
            {m.batchNames.length ? ` · ${m.batchNames.join(", ")}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "kind",
      header: "Kind",
      className: "w-28",
      cell: (m) => (
        <Badge variant="secondary" className="text-[10px]">
          {m.fileUrl
            ? (m.fileName?.split(".").pop()?.toUpperCase() ?? "File")
            : "Written"}
        </Badge>
      ),
    },
    {
      key: "reads",
      header: "Read",
      className: "w-32",
      cell: (m) => (
        <button
          type="button"
          onClick={() => void openReaders(m)}
          className="hover:text-foreground text-left text-sm"
        >
          <span className="tabular-nums">{m.readers}</span>{" "}
          <span className="text-muted-foreground text-xs">
            {m.readers === 1 ? "learner" : "learners"}
          </span>
          <span className="text-muted-foreground block text-xs">
            {readable(m.readSeconds)}
          </span>
        </button>
      ),
    },
    {
      key: "downloads",
      header: "Downloads",
      className: "w-24",
      cell: (m) => (
        <Badge variant="secondary" className="text-[10px]">
          {m.downloadsEnabled ? "On" : "Off"}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      className: "w-28",
      cell: (m) =>
        m.isPublished ? (
          <Badge
            variant="secondary"
            className="bg-emerald-100 text-[10px] text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
          >
            Published
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px]">
            Draft
          </Badge>
        ),
    },
    {
      key: "actions",
      header: "",
      className: "w-12",
      cell: (m) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" />}
            aria-label="Actions"
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => void openEdit(m)}>
              <Pencil className="size-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void togglePublished(m)}>
              {m.isPublished ? (
                <>
                  <EyeOff className="size-4" /> Hide
                </>
              ) : (
                <>
                  <Eye className="size-4" /> Publish
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void openReaders(m)}>
              <Users className="size-4" /> Who has read it
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setDeleting(m)}
            >
              <Trash2 className="size-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Study material"
        description="The reading a course sets — grouped, numbered and assigned like your quizzes."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`${basePath}/groups/material`} />}
            >
              <FolderTree className="size-4" /> Groups
            </Button>
            <Button variant="outline" onClick={() => setExporting(true)}>
              <Download className="size-4" /> Export
            </Button>
            <ImportButton
              busy={importing}
              onImport={onImport}
              title="Import study material"
              description="Rows are matched by title. Choose what should happen when a piece of that name is already here."
            />
            <Button onClick={() => setForm(blankForm())}>
              <Plus className="size-4" /> Add material
            </Button>
          </div>
        }
      />

      <ExportDialog
        open={exporting}
        onOpenChange={setExporting}
        title="Export study material"
        description="Pick what goes in the sheet and which columns it carries. The blank sample sheet comes out with the same columns, ready to fill in and import."
        endpoint="/api/materials/export"
        columns={[...MATERIAL_EXPORT_COLUMNS]}
        defaultColumns={[...DEFAULT_MATERIAL_COLUMNS]}
        sampleKinds={MATERIAL_SAMPLE_KINDS.map((k) => ({
          key: k,
          label: MATERIAL_SAMPLE_LABEL[k],
        }))}
        scopes={[
          {
            key: "group",
            label: "Folder",
            anyLabel: "Every folder",
            // A folder takes everything beneath it as well.
            options: groups.map((g) => ({ value: g.id, label: g.path })),
          },
          {
            key: "course",
            label: "Course",
            anyLabel: "Every course",
            options: courses.map((c) => ({ value: c.id, label: c.title })),
          },
          {
            key: "batch",
            label: "Batch",
            anyLabel: "Every batch",
            options: batches.map((b) => ({ value: b.id, label: b.name })),
          },
          {
            key: "ids",
            label: "A single piece",
            anyLabel: "Everything that matches",
            options: materials.map((m) => ({ value: m.id, label: m.title })),
          },
          {
            key: "status",
            label: "Status",
            anyLabel: "Published and draft",
            options: [
              { value: "yes", label: "Published only" },
              { value: "no", label: "Drafts only" },
            ],
          },
        ]}
      />

      {/* Each figure narrows the list below to what it counts; tapping it
          again clears that. */}
      <StatCards
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        cards={[
          {
            label: "Material",
            value: stats.total,
            icon: FileText,
            tone: "text-rose-500",
            hint: "Everything filed. Tap to clear the filters.",
            active: !hasFilters,
            onClick: clearFilters,
          },
          {
            label: "Published",
            value: stats.published,
            icon: Eye,
            tone: "text-emerald-500",
            hint: "Reading learners can open.",
            active: published === "yes",
            onClick: () => setPublished(published === "yes" ? ALL : "yes"),
          },
          {
            label: "Documents",
            value: stats.withFile,
            icon: BookOpen,
            tone: "text-violet-500",
            hint: "Material with a file attached.",
            active: kindFilter === "file",
            onClick: () => setKindFilter(kindFilter === "file" ? ALL : "file"),
          },
          {
            label: "Reading records",
            value: stats.readers,
            icon: Users,
            tone: "text-sky-500",
            hint: "How many times learners have opened the reading.",
          },
        ]}
      />

      {/* Folder view: the academy's own tree, each folder opening to what is
          filed in it. The table is still a tap away for a flat list. */}
      {view === "folders" && (
        <div className="space-y-2">
          {folders.length === 0 ? (
            <p className="text-muted-foreground rounded-xl border p-6 text-center text-sm">
              Nothing matches those filters.
            </p>
          ) : (
            folders.map(([path, list]) => {
              const open = openFolders.has(path);
              return (
                <div key={path} className="overflow-hidden rounded-xl border">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenFolders((prev) => {
                        const next = new Set(prev);
                        if (next.has(path)) next.delete(path);
                        else next.add(path);
                        return next;
                      })
                    }
                    className="hover:bg-accent/40 flex w-full items-center gap-2 px-4 py-3 text-left"
                  >
                    <ChevronRight
                      className={cn(
                        "text-muted-foreground size-4 shrink-0 transition-transform",
                        open && "rotate-90",
                      )}
                    />
                    <FolderTree className="text-muted-foreground size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {path}
                    </span>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {list.length} {list.length === 1 ? "item" : "items"}
                    </Badge>
                  </button>
                  {open && (
                    <ul className="divide-y border-t">
                      {list.map((m) => (
                        <li
                          key={m.id}
                          className="flex items-center gap-3 px-4 py-2.5"
                        >
                          <span className="text-muted-foreground w-8 shrink-0 text-xs tabular-nums">
                            {m.number}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {m.title}
                            </p>
                            <p className="text-muted-foreground truncate text-xs">
                              {m.courseTitles.join(", ") || "Any course"}
                              {m.batchNames.length
                                ? ` · ${m.batchNames.join(", ")}`
                                : ""}
                            </p>
                          </div>
                          <Badge
                            variant="secondary"
                            className="shrink-0 text-[10px]"
                          >
                            {m.fileUrl || m.assets.length ? "File" : "Written"}
                          </Badge>
                          <Badge
                            variant="secondary"
                            className={cn(
                              "shrink-0 text-[10px]",
                              m.isPublished &&
                                "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
                            )}
                          >
                            {m.isPublished ? "Published" : "Draft"}
                          </Badge>
                          {/* "When I open through folder then I can not edit
                              it" — the same action the table row has. */}
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            className="shrink-0"
                            onClick={() => void openEdit(m)}
                            disabled={loadingEdit === m.id}
                            aria-label={`Edit ${m.title}`}
                            title="Edit"
                          >
                            {loadingEdit === m.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Pencil className="size-4" />
                            )}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      <DataTable
        columns={columns}
        data={view === "folders" ? [] : rows}
        rowKey={(m) => m.id}
        emptyTitle="No study material yet"
        emptyDescription="Upload a PDF, a spreadsheet or a document — or write the reading straight into the panel."
        emptyIcon={FileText}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search material…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-56"
            />
            {/* Searchable, because a deep tree is no use as a scroll list. */}
            <FolderSelect
              className="w-full sm:w-56"
              ariaLabel="Filter by group"
              topLabel="Every group"
              options={groups}
              value={category === ALL ? null : category}
              onChange={(next) => setCategory(next ?? ALL)}
            />
            {/* The two filters the academy said were missing here. */}
            <Select value={course} onValueChange={(v) => setCourse(String(v))}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue placeholder="Any course">
                  {(v) =>
                    !v || v === ALL ? "Any course" : courseLabel(String(v))
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any course</SelectItem>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={batch} onValueChange={(v) => setBatch(String(v))}>
              <SelectTrigger className="w-full sm:w-52">
                <SelectValue placeholder="Any batch">
                  {(v) =>
                    !v || v === ALL ? "Any batch" : batchLabel(String(v))
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any batch</SelectItem>
                {batches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={published}
              onValueChange={(v) => setPublished(String(v))}
            >
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue placeholder="Any status">
                  {(v) =>
                    !v || v === ALL
                      ? "Any status"
                      : v === "yes"
                        ? "Published"
                        : "Draft"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any status</SelectItem>
                <SelectItem value="yes">Published</SelectItem>
                <SelectItem value="no">Draft</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setView(view === "folders" ? "table" : "folders")}
            >
              {view === "folders" ? (
                <>
                  <Rows3 className="size-4" /> Table
                </>
              ) : (
                <>
                  <FolderTree className="size-4" /> Folders
                </>
              )}
            </Button>
            <Select
              value={sort}
              onValueChange={(v) => setSort(String(v) as typeof sort)}
            >
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Sort">
                  {(v) =>
                    ({
                      sequence: "Academy order",
                      newest: "Newest first",
                      title: "Title",
                      reads: "Most read",
                    })[String(v ?? "sequence")] ?? "Academy order"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sequence">Academy order</SelectItem>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="title">Title</SelectItem>
                <SelectItem value="reads">Most read</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      {/* ── Add / edit ──────────────────────────────────────────────────── */}
      <Dialog open={form !== null} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {form?.id ? "Edit material" : "Add material"}
            </DialogTitle>
            <DialogDescription>
              A document, a spreadsheet, a PDF — or reading written here, which
              learners can highlight.
            </DialogDescription>
          </DialogHeader>
          {form && (
            <form onSubmit={save} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="m-title">Title</Label>
                <Input
                  id="m-title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-desc">What it covers</Label>
                <Textarea
                  id="m-desc"
                  rows={2}
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </div>

              {/* Folders, courses and cohorts — all of them multiple, because
                  one piece of reading is rarely for exactly one of anything. */}
              <GroupPicker
                options={groups}
                value={form.groupIds}
                onChange={(next) => setForm({ ...form, groupIds: next })}
                emptyHint="No groups yet — add some under Groups."
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <MultiPicker
                  label="Courses"
                  hint="Leave empty to set it for no course in particular."
                  options={courses.map((c) => ({ id: c.id, label: c.title }))}
                  value={form.courseIds}
                  onChange={(next) => setForm({ ...form, courseIds: next })}
                  emptyHint="No courses yet."
                />
                <MultiPicker
                  label="Batches"
                  hint="Empty means everyone on the courses above."
                  options={batches.map((b) => ({ id: b.id, label: b.name }))}
                  value={form.batchIds}
                  onChange={(next) => setForm({ ...form, batchIds: next })}
                  emptyHint="No batches yet."
                />
              </div>

              {/* Attachments: as many as the reading needs, in any mix of
                  documents, images, video and links out. */}
              <div className="space-y-2">
                <Label>Files, images, video and links</Label>
                {form.assets.length > 0 && (
                  <ul className="divide-y rounded-lg border">
                    {form.assets.map((a, i) => (
                      <li
                        key={`${a.url}-${i}`}
                        className="flex items-center gap-2 px-3 py-2"
                      >
                        <span className="text-muted-foreground shrink-0">
                          {a.kind === "LINK" ? (
                            <LinkIcon className="size-4" />
                          ) : a.kind === "IMAGE" ? (
                            <ImageIcon className="size-4" />
                          ) : a.kind === "VIDEO" ? (
                            <Video className="size-4" />
                          ) : (
                            <FileText className="size-4" />
                          )}
                        </span>
                        {editingAsset === i ? (
                          /* "m not able to edit link" — a link could only be
                             removed and added again. Both its name and its
                             address can be changed in place now. */
                          <>
                            <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row">
                              <Input
                                value={a.name}
                                onChange={(e) =>
                                  setForm({
                                    ...form,
                                    assets: form.assets.map((x, at) =>
                                      at === i ? { ...x, name: e.target.value } : x,
                                    ),
                                  })
                                }
                                placeholder="What it is called"
                                className="h-8"
                              />
                              {a.kind === "LINK" && (
                                <Input
                                  value={a.url}
                                  onChange={(e) =>
                                    setForm({
                                      ...form,
                                      assets: form.assets.map((x, at) =>
                                        at === i ? { ...x, url: e.target.value } : x,
                                      ),
                                    })
                                  }
                                  placeholder="https://…"
                                  className="h-8"
                                />
                              )}
                            </span>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              aria-label="Done"
                              onClick={() => setEditingAsset(null)}
                            >
                              <Check className="size-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <a
                              href={a.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-w-0 flex-1 truncate text-sm hover:underline"
                            >
                              {a.name || a.url}
                            </a>
                            {i === 0 && (
                              <Badge
                                variant="secondary"
                                className="shrink-0 text-[10px]"
                              >
                                Main
                              </Badge>
                            )}
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`Edit ${a.name || a.url}`}
                              onClick={() => setEditingAsset(i)}
                            >
                              <Pencil className="size-4" />
                            </Button>
                          </>
                        )}
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Remove ${a.name || a.url}`}
                          onClick={() => {
                            setEditingAsset(null);
                            setForm({
                              ...form,
                              assets: form.assets.filter((_, at) => at !== i),
                            });
                          }}
                        >
                          <X className="size-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <label className="hover:bg-accent/50 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm">
                    {uploading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Upload className="text-muted-foreground size-4" />
                    )}
                    <span className="text-muted-foreground">
                      {uploading
                        ? "Uploading…"
                        : "Add files — documents, images or video"}
                    </span>
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => void upload(e.target.files)}
                    />
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addLink}
                  >
                    <LinkIcon className="size-4" /> Add a link
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                  The first one is what a learner downloads; the rest sit
                  beneath it.
                </p>
              </div>

              {/* The reading itself, written properly — headings, lists,
                  emphasis, quotes — rather than in a plain box. */}
              <div className="space-y-1.5">
                <Label>Or write it here</Label>
                <RichTextEditor
                  value={form.body}
                  onChange={(html) => setForm({ ...form, body: html })}
                  placeholder="Paste or type the reading. Learners can highlight this and keep their own notes against it."
                />
                {form.id && (
                  <p className="text-muted-foreground text-xs">
                    This is the text as it is saved — what you leave here is what
                    learners will read.
                  </p>
                )}
              </div>

              {/* Neither a course nor a cohort means nobody is its audience —
                  the same rule quizzes follow, and worth saying out loud. */}
              {form.courseIds.length === 0 && form.batchIds.length === 0 && (
                <p className="rounded-xl border border-amber-300/60 bg-amber-50/60 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                  Pick a course or a batch — material with neither reaches no
                  learners.
                </p>
              )}

              {/* Only once it exists: a link needs something to point at. */}
              {form.id && (
                <RelatedContent kind="MATERIAL" id={form.id} canEdit />
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Allow downloads</p>
                    <p className="text-muted-foreground text-xs">
                      Off means read in the panel only.
                    </p>
                  </div>
                  <Switch
                    checked={form.downloadsEnabled}
                    onCheckedChange={(v) =>
                      setForm({ ...form, downloadsEnabled: Boolean(v) })
                    }
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Published</p>
                    <p className="text-muted-foreground text-xs">
                      Visible to its learners.
                    </p>
                  </div>
                  <Switch
                    checked={form.isPublished}
                    onCheckedChange={(v) =>
                      setForm({ ...form, isPublished: Boolean(v) })
                    }
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setForm(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="size-4 animate-spin" />}
                  {form.id ? "Save changes" : "Add material"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Who has read it ─────────────────────────────────────────────── */}
      <Sheet
        open={readersOf !== null}
        onOpenChange={(o) => !o && setReadersOf(null)}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{readersOf?.title}</SheetTitle>
            <SheetDescription>
              {readers.length === 0
                ? "Nobody has opened this yet."
                : `${readers.length} learner${readers.length === 1 ? "" : "s"} have opened it.`}
            </SheetDescription>
          </SheetHeader>
          <ul className="divide-y px-4 pb-6">
            {readers.map((r) => (
              <li key={r.userId} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.name}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {r.email}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm tabular-nums">{readable(r.seconds)}</p>
                  <p className="text-muted-foreground text-xs">
                    {r.opens} open{r.opens === 1 ? "" : "s"}
                    {r.downloads > 0
                      ? ` · ${r.downloads} download${r.downloads === 1 ? "" : "s"}`
                      : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>

      {/* ── Delete ──────────────────────────────────────────────────────── */}
      <Dialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this material?</DialogTitle>
            <DialogDescription>
              &ldquo;{deleting?.title}&rdquo; and every learner&apos;s reading
              record and highlights on it go with it. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={() => void confirmDelete()}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
