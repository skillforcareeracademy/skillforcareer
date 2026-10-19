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
  FolderTree,
  Image as ImageIcon,
  Link as LinkIcon,
  Loader2,
  Copy,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Users,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
  FolderDepthFilter,
  deepestLevel,
  type FolderDepth,
} from "@/components/shared/folder-depth-filter";
import type {
  MaterialRow,
  MaterialStats,
} from "@/server/services/study-material-service";
import {
  FolderExplorer,
  segmentsOf,
} from "@/components/shared/folder-explorer";
import { LinkViewer } from "@/components/shared/link-viewer";
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
  /** Which course it belongs to, so the picker can narrow by it. */
  courseId: string | null;
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

/** Rich-text bodies are stored as HTML; anything older is plain text. */
function looksLikeHtml(body: string): boolean {
  return /<(p|h[1-6]|ul|ol|li|strong|em|blockquote|br|img)\b/i.test(body);
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
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ m: MaterialRow; body: string } | null>(
    null,
  );
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
  /**
   * How deep the folder list goes. First level by default: "Normally first
   * level folder dikhne do. Phir jab second level folder kholne ho to wo khol
   * lu ya phir aage usse."
   */
  const [depth, setDepth] = useState<FolderDepth>(0);
  const [exporting, setExporting] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);

  /**
   * The cohorts worth offering: those on the courses currently ticked, or all
   * of them while no course is. A batch already chosen stays in the list even
   * if its course is later unticked, so unticking cannot silently strand a
   * selection the form is still carrying.
   */
  const batchesForCourses = useMemo(() => {
    const courseIds = form?.courseIds ?? [];
    if (courseIds.length === 0) return batches;
    const chosen = new Set(form?.batchIds ?? []);
    return batches.filter(
      (b) => (b.courseId && courseIds.includes(b.courseId)) || chosen.has(b.id),
    );
  }, [batches, form?.courseIds, form?.batchIds]);
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

  /** Only offer levels the academy's own tree actually reaches. */
  const deepest = useMemo(
    () => deepestLevel(rows.flatMap((m) => m.groupPaths)),
    [rows],
  );

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

  /** Copy a piece and open the copy — the copy arrives as a draft. */
  async function duplicate(m: MaterialRow) {
    setDuplicating(m.id);
    try {
      await api.post(`/api/materials/${m.id}/duplicate`);
      toast.success("Copied. The copy is a draft.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't duplicate.");
    } finally {
      setDuplicating(null);
    }
  }

  /** Read the piece without entering the editor — the written text and the
   *  file, shown in place. "Text jo daala hai descriptor me wo yaha se dekhne
   *  view krne ka option nahi hai." */
  async function openView(m: MaterialRow) {
    try {
      const res = await api.get<{ material: { body: string | null } }>(
        `/api/materials/${m.id}`,
      );
      setViewing({ m, body: res.material.body ?? "" });
    } catch {
      toast.error("Couldn't load that one — try again.");
    }
  }

  /** The row action menu — the same one the table and the folder view use. */
  function materialActions(m: MaterialRow) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" />}
          aria-label="Actions"
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => void openView(m)}>
            <FileText className="size-4" /> View
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void openEdit(m)}>
            <Pencil className="size-4" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={duplicating === m.id}
            onClick={() => void duplicate(m)}
          >
            {duplicating === m.id ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Copy className="size-4" />
            )}
            Duplicate
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
    );
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

  /** Drag-and-drop handed us one folder's ids in their new order. */
  async function reorderGroup(ids: string[]) {
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
    try {
      const res = await api.get<{ material: { body: string | null } }>(
        `/api/materials/${m.id}`,
      );
      setForm({ ...base, body: res.material.body ?? "" });
    } catch {
      toast.error("Couldn't load that one — try again.");
    } finally {
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
      key: "actions",
      header: "",
      className: "w-12",
      cell: (m) => materialActions(m),
    },
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
        bundleEndpoint="/api/materials/export/bundle"
        bundleLabel="With files (ZIP)"
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

      {/* Folder view: the academy's own tree, opened a shelf at a time —
          sub-folders first, then what is filed in the folder you are in, as
          deep as it was nested. The table is still a tap away for a flat list. */}
      {/* Folder view and table view show together — "upar folder niche table".
          The folders drill in; the table below is the flat, sortable list. */}
      <div>
        <FolderExplorer
          items={rows}
          keyOf={(m) => m.id}
          getPaths={(m) =>
            m.groupPaths.length
              ? m.groupPaths.map(segmentsOf)
              : [["Ungrouped"]]
          }
          depth={depth}
          query={search}
          noun={{ one: "item", many: "material" }}
          emptyLabel="Nothing matches those filters."
          onReorder={(ids) => void reorderGroup(ids)}
          renderItem={(m) => {
            const previewUrl =
              m.fileUrl ?? m.assets.find((a) => a.url)?.url ?? null;
            return (
              <div className="flex items-center gap-2 py-2.5 pr-3 pl-1">
                <div className="shrink-0">{materialActions(m)}</div>
                <span className="text-muted-foreground w-8 shrink-0 text-xs tabular-nums">
                  {m.number}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.title}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {m.courseTitles.join(", ") || "Any course"}
                    {m.batchNames.length ? ` · ${m.batchNames.join(", ")}` : ""}
                  </p>
                </div>
                <Badge variant="secondary" className="shrink-0 text-[10px]">
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
                {/* Read it in place without opening the editor — "yahan bahar
                    se bhi preview ka option hona chahiye". */}
                {previewUrl && (
                  <LinkViewer
                    url={previewUrl}
                    name={m.fileName ?? m.title}
                    className="shrink-0"
                  >
                    <span
                      role="button"
                      aria-label={`Preview ${m.title}`}
                      title="Preview"
                      className="hover:bg-accent text-muted-foreground inline-grid size-8 place-items-center rounded-md"
                    >
                      <Eye className="size-4" />
                    </span>
                  </LinkViewer>
                )}
              </div>
            );
          }}
        />
      </div>

      <DataTable
        columns={columns}
        data={rows}
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
            {/* How many levels of the tree to show at once. */}
            <FolderDepthFilter
              value={depth}
              onChange={setDepth}
              deepest={deepest}
            />
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
      {/* Read-only view — the written text and any file, without the editor. */}
      {viewing && (
        <Dialog open onOpenChange={(o) => !o && setViewing(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{viewing.m.title}</DialogTitle>
              {viewing.m.description && (
                <DialogDescription>{viewing.m.description}</DialogDescription>
              )}
            </DialogHeader>

            <div className="space-y-4">
              {viewing.body.trim() ? (
                looksLikeHtml(viewing.body) ? (
                  <div
                    className="prose-blog prose-blog-sm max-w-none"
                    // Authored in the panel's editor, the same HTML the learner reads.
                    dangerouslySetInnerHTML={{ __html: viewing.body }}
                  />
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{viewing.body}</p>
                )
              ) : null}

              {(viewing.m.fileUrl || viewing.m.assets.length > 0) && (
                <div className="space-y-2">
                  {viewing.m.fileUrl && (
                    <LinkViewer
                      url={viewing.m.fileUrl}
                      name={viewing.m.fileName ?? "Document"}
                    >
                      <span className="bg-muted/50 hover:bg-muted flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                        <Eye className="size-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-left">
                          {viewing.m.fileName ?? "Open document"}
                        </span>
                      </span>
                    </LinkViewer>
                  )}
                  {viewing.m.assets.map((a) => (
                    <LinkViewer key={a.id} url={a.url} name={a.name ?? "Attachment"}>
                      <span className="bg-muted/50 hover:bg-muted flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                        <Eye className="size-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-left">
                          {a.name ?? a.url.split("/").pop() ?? "Attachment"}
                        </span>
                      </span>
                    </LinkViewer>
                  ))}
                </div>
              )}

              {!viewing.body.trim() &&
                !viewing.m.fileUrl &&
                viewing.m.assets.length === 0 && (
                  <p className="text-muted-foreground text-sm">
                    Nothing to show for this one yet.
                  </p>
                )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  const m = viewing.m;
                  setViewing(null);
                  void openEdit(m);
                }}
              >
                <Pencil className="size-4" /> Edit
              </Button>
              <Button onClick={() => setViewing(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

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
                {/* Narrowed to the courses ticked beside it. The academy runs
                    dozens of cohorts and only a handful belong to the course in
                    hand, so showing all of them is how the wrong one gets
                    picked. With no course chosen, every batch is offered. */}
                <MultiPicker
                  label="Batches"
                  hint={
                    form.courseIds.length > 0
                      ? "Batches of the chosen courses. Empty means everyone on them."
                      : "Empty means everyone on the courses above."
                  }
                  options={batchesForCourses.map((b) => ({
                    id: b.id,
                    label: b.name,
                  }))}
                  value={form.batchIds}
                  onChange={(next) => setForm({ ...form, batchIds: next })}
                  emptyHint={
                    form.courseIds.length > 0
                      ? "No batches on those courses."
                      : "No batches yet."
                  }
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
                        {/* See it before the learners do — "link jo daale hain
                            yahan unke preview ka option hona chahiye." A
                            pasted address is easy to get wrong, and the first
                            person to find out should not be a learner. */}
                        {a.url && (
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            nativeButton={false}
                            aria-label={`Preview ${a.name || a.url}`}
                            title="Preview this in a new tab"
                            render={
                              <a href={a.url} target="_blank" rel="noreferrer" />
                            }
                          >
                            <Eye className="size-4" />
                          </Button>
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
