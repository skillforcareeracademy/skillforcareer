"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Eye,
  FileText,
  Loader2,
  Newspaper,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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
import { EmptyState } from "@/components/shared/empty-state";
import type { BlogPostRow } from "@/server/services/blog-service";

interface BlogPage {
  posts: BlogPostRow[];
  total: number;
  page: number;
  pageSize: number;
}

const STATUS_FILTERS = [
  { value: "all", label: "All posts" },
  { value: "PUBLISHED", label: "Published" },
  { value: "DRAFT", label: "Drafts" },
];

/** Admin → Blog. The list; writing happens on the post's own page. */
export function BlogClient({ initial }: { initial: BlogPage }) {
  const router = useRouter();
  const [page, setPage] = useState(initial);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<BlogPostRow | null>(null);

  const load = useCallback((term: string, only: string) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (term.trim()) params.set("search", term.trim());
    if (only !== "all") params.set("status", only);

    api.get<BlogPage>(`/api/blog?${params}`).then(
      (next) => {
        setPage(next);
        setLoading(false);
      },
      (e: unknown) => {
        setLoading(false);
        toast.error(e instanceof ApiError ? e.message : "Couldn't load the posts.");
      },
    );
  }, []);

  const [applied, setApplied] = useState({ search: "", status: "all" });
  useEffect(() => {
    if (applied.search === search && applied.status === status) return;
    const id = setTimeout(
      () => {
        setApplied({ search, status });
        load(search, status);
      },
      search === applied.search ? 0 : 300,
    );
    return () => clearTimeout(id);
  }, [search, status, applied, load]);

  async function createDraft() {
    setCreating(true);
    try {
      // A blank draft rather than a "new post" dialog: the writing happens on
      // the post page, and a title typed into a modal only has to be retyped.
      const res = await api.post<{ id: string }>("/api/blog", {
        title: "Untitled post",
        status: "DRAFT",
        content: "",
      });
      router.push(`/admin/blog/${res.id}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't create a post.");
      setCreating(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    const post = deleting;
    setDeleting(null);
    try {
      await api.del(`/api/blog/${post.id}`);
      setPage((p) => ({
        ...p,
        posts: p.posts.filter((x) => x.id !== post.id),
        total: Math.max(0, p.total - 1),
      }));
      toast.success("Post deleted.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't delete that post.");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Blog"
        description="Write and publish articles. Published posts appear at /blog."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              nativeButton={false}
              render={<a href="/blog" target="_blank" rel="noreferrer noopener" />}
            >
              <Eye className="size-4" /> View blog
            </Button>
            <Button onClick={createDraft} disabled={creating}>
              {creating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              New post
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search posts…"
              className="pl-9"
            />
          </div>
          <Select value={status} onValueChange={(v) => v && setStatus(v)}>
            <SelectTrigger className="sm:w-44">
              <SelectValue>
                {(v) => STATUS_FILTERS.find((s) => s.value === v)?.label ?? "All posts"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-muted-foreground grid h-64 place-items-center">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : page.posts.length === 0 ? (
        <EmptyState
          icon={Newspaper}
          title={search || status !== "all" ? "Nothing matches that" : "No posts yet"}
          description="Write your first article — it appears on the public blog as soon as you publish it."
        />
      ) : (
        <ul className="space-y-3">
          {page.posts.map((post) => (
            <li key={post.id}>
              <div className="bg-card flex flex-wrap items-center gap-4 rounded-xl border p-3 sm:p-4">
                <div className="bg-muted relative hidden aspect-4/3 w-24 shrink-0 overflow-hidden rounded-lg sm:block">
                  {post.coverUrl ? (
                    <Image
                      src={post.coverUrl}
                      alt=""
                      fill
                      sizes="96px"
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <span className="text-muted-foreground grid h-full place-items-center">
                      <FileText className="size-5" />
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{post.title}</p>
                    <Badge variant={post.status === "PUBLISHED" ? "default" : "secondary"}>
                      {post.status === "PUBLISHED" ? "Published" : "Draft"}
                    </Badge>
                  </div>
                  {post.excerpt && (
                    <p className="text-muted-foreground mt-0.5 line-clamp-1 text-sm">
                      {post.excerpt}
                    </p>
                  )}
                  <p className="text-muted-foreground mt-1 text-xs">
                    {post.publishedAt
                      ? format(new Date(post.publishedAt), "d MMM yyyy")
                      : `edited ${format(new Date(post.updatedAt), "d MMM yyyy")}`}
                    {" · "}
                    {post.readMinutes} min read
                    {post.status === "PUBLISHED" && <> · {post.views} views</>}
                    {post.authorName && <> · {post.authorName}</>}
                  </p>
                </div>

                <div className="ml-auto flex items-center gap-2">
                  {post.status === "PUBLISHED" && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      nativeButton={false}
                      aria-label={`View ${post.title}`}
                      render={
                        <a
                          href={`/blog/${post.slug}`}
                          target="_blank"
                          rel="noreferrer noopener"
                        />
                      }
                    >
                      <Eye className="size-4" />
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                    render={<Link href={`/admin/blog/${post.id}`} />}
                  >
                    <Pencil className="size-4" /> Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleting(post)}
                    aria-label={`Delete ${post.title}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-muted-foreground text-sm">
        {page.total} post{page.total === 1 ? "" : "s"}
      </p>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The post and its address go for good. Anyone who has linked to it
              will get a not-found page. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
