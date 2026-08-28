"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, Loader2, Save, Send, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { PageHeader } from "@/components/shared/page-header";
import { ImageUpload } from "@/components/shared/image-upload";
import { RichTextEditor } from "@/components/shared/rich-text-editor";
import { readingMinutes, slugifyTitle } from "@/lib/validations/blog";
import type { BlogPostDetail } from "@/server/services/blog-service";

interface CategoryOption {
  id: string;
  name: string;
}

/**
 * Write a post.
 *
 * The address is derived from the title until someone edits it by hand, at
 * which point it is theirs — a published post's URL must not move just because
 * the headline was reworded.
 */
export function BlogEditor({
  post,
  categories,
}: {
  post: BlogPostDetail;
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    content: post.content,
    coverUrl: post.coverUrl,
    status: post.status,
    tags: post.tags.join(", "),
    categoryId: post.categoryId,
    metaTitle: post.metaTitle,
    metaDescription: post.metaDescription,
  });
  const [slugTouched, setSlugTouched] = useState(post.slug !== slugifyTitle(post.title));
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);

  const dirty = useMemo(
    () =>
      form.title !== post.title ||
      form.slug !== post.slug ||
      form.excerpt !== post.excerpt ||
      form.content !== post.content ||
      form.coverUrl !== post.coverUrl ||
      form.status !== post.status ||
      form.tags !== post.tags.join(", ") ||
      form.categoryId !== post.categoryId ||
      form.metaTitle !== post.metaTitle ||
      form.metaDescription !== post.metaDescription,
    [form, post],
  );

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setTitle(title: string) {
    setForm((prev) => ({
      ...prev,
      title,
      slug: slugTouched ? prev.slug : slugifyTitle(title),
    }));
  }

  async function save(status: "DRAFT" | "PUBLISHED") {
    if (form.title.trim().length < 3) {
      toast.error("Give the post a title first.");
      return;
    }
    setSaving(status === "PUBLISHED" ? "publish" : "draft");
    try {
      await api.patch(`/api/blog/${post.id}`, {
        ...form,
        status,
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      toast.success(status === "PUBLISHED" ? "Post published." : "Draft saved.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save. Try again.");
    } finally {
      setSaving(null);
    }
  }

  const minutes = readingMinutes(form.content);

  return (
    <div className="space-y-6">
      <PageHeader
        title={form.title || "Untitled post"}
        description={`${
          post.status === "PUBLISHED" ? "Published" : "Draft"
        } · ${minutes} min read · /blog/${form.slug || "…"}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              nativeButton={false}
              render={<Link href="/admin/blog" />}
            >
              <ArrowLeft className="size-4" /> Back
            </Button>
            {post.status === "PUBLISHED" && (
              <Button
                variant="outline"
                nativeButton={false}
                render={
                  <a href={`/blog/${post.slug}`} target="_blank" rel="noreferrer noopener" />
                }
              >
                <Eye className="size-4" /> View
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => save("DRAFT")}
              disabled={saving !== null}
            >
              {saving === "draft" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save draft
            </Button>
            <Button onClick={() => save("PUBLISHED")} disabled={saving !== null}>
              {saving === "publish" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              {post.status === "PUBLISHED" ? "Update" : "Publish"}
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-1.5">
                <Label htmlFor="post-title">Title</Label>
                <Input
                  id="post-title"
                  value={form.title}
                  maxLength={180}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What is medical coding, and who hires for it?"
                  className="text-base"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="post-slug">Address</Label>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground shrink-0 text-sm">/blog/</span>
                  <Input
                    id="post-slug"
                    value={form.slug}
                    maxLength={120}
                    onChange={(e) => {
                      setSlugTouched(true);
                      set("slug", e.target.value.toLowerCase());
                    }}
                    className="font-mono text-xs"
                  />
                  {slugTouched && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Take the address from the title again"
                      onClick={() => {
                        setSlugTouched(false);
                        set("slug", slugifyTitle(form.title));
                      }}
                    >
                      <Undo2 className="size-4" />
                    </Button>
                  )}
                </div>
                <p className="text-muted-foreground text-xs">
                  Follows the title until you edit it. Changing a published
                  post&apos;s address breaks any link to it.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="post-excerpt">Summary</Label>
                <Textarea
                  id="post-excerpt"
                  rows={2}
                  value={form.excerpt}
                  maxLength={400}
                  onChange={(e) => set("excerpt", e.target.value)}
                  placeholder="One or two lines — shown on the blog card and in search results."
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Article</CardTitle>
              <CardDescription>
                {minutes} minute read at the moment.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RichTextEditor
                value={form.content}
                onChange={(html) => set("content", html)}
                placeholder="Write the post…"
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Cover image</CardTitle>
              <CardDescription>Shown on the card and at the top of the post.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <ImageUpload
                value={form.coverUrl}
                onChange={(url) => set("coverUrl", url)}
                label="cover"
                previewClassName="size-20"
              />
              <Input
                value={form.coverUrl}
                onChange={(e) => set("coverUrl", e.target.value)}
                placeholder="…or paste an image path"
                className="font-mono text-xs"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Filing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="post-tags">Tags</Label>
                <Input
                  id="post-tags"
                  value={form.tags}
                  onChange={(e) => set("tags", e.target.value)}
                  placeholder="medical coding, careers"
                />
                <p className="text-muted-foreground text-xs">
                  Comma-separated. Readers can filter the blog by these.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Course category</Label>
                <Select
                  value={form.categoryId || "none"}
                  onValueChange={(v) => set("categoryId", v === "none" ? "" : (v ?? ""))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v) =>
                        categories.find((c) => c.id === v)?.name ?? "No category"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No category</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Search listing</CardTitle>
              <CardDescription>
                Leave blank to use the title and summary above.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="post-meta-title">Page title</Label>
                <Input
                  id="post-meta-title"
                  value={form.metaTitle}
                  maxLength={180}
                  onChange={(e) => set("metaTitle", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="post-meta-description">Description</Label>
                <Textarea
                  id="post-meta-description"
                  rows={3}
                  value={form.metaDescription}
                  maxLength={400}
                  onChange={(e) => set("metaDescription", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {dirty && (
            <p className="text-muted-foreground text-center text-xs">
              You have unsaved changes.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
