"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  ExternalLink,
  IndianRupee,
  Loader2,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import {
  EXPERIENCE_LEVELS,
  EXPERIENCE_LEVEL_LABELS,
  JOB_MODES,
  JOB_MODE_LABELS,
  type ExperienceLevel,
  type JobMode,
} from "@/lib/validations/careers";
import type { HiringPartnerRow, HiringPostRow } from "@/server/services/careers-service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/empty-state";
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
import { LevelBadge } from "@/components/admin/careers/career-badges";
import { PartnerDialog, apiErrorMessage } from "@/components/admin/careers/partner-dialog";
import { PartnerContact, websiteHref } from "@/components/admin/careers/placement-partners-panel";

const BASE = "/api/admin/careers/hiring-partners";
const POSTS = "/api/admin/careers/hiring-posts";
const NO_MODE = "none";

type Deleting =
  | { kind: "partner"; partner: HiringPartnerRow }
  | { kind: "post"; post: HiringPostRow }
  | null;

/**
 * Companies that hire our candidates, each with the posts it is filling — for
 * freshers or for experienced people. Open posts at active partners also show
 * on the public careers page (without any contact details).
 */
export function HiringPartnersPanel({
  partners,
  onViewCandidates,
}: {
  partners: HiringPartnerRow[];
  onViewCandidates: (partnerId: string) => void;
}) {
  const router = useRouter();
  const [partnerDialog, setPartnerDialog] = useState<{ open: boolean; partner: HiringPartnerRow | null }>({
    open: false,
    partner: null,
  });
  const [postDialog, setPostDialog] = useState<{
    open: boolean;
    partner: HiringPartnerRow | null;
    post: HiringPostRow | null;
  }>({ open: false, partner: null, post: null });
  const [deleting, setDeleting] = useState<Deleting>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function patch(url: string, body: object, done: string) {
    setBusy(url);
    try {
      await api.patch(url, body);
      toast.success(done);
      router.refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't update."));
    } finally {
      setBusy(null);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      if (deleting.kind === "partner") {
        await api.del(`${BASE}/${deleting.partner.id}`);
        toast.success("Hiring partner deleted.");
      } else {
        await api.del(`${POSTS}/${deleting.post.id}`);
        toast.success("Post deleted.");
      }
      setDeleting(null);
      router.refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Delete failed."));
    }
  }

  const openPosts = partners.reduce(
    (n, p) => n + (p.isActive ? p.posts.filter((post) => post.isOpen).length : 0),
    0,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">
          Companies that hire our candidates, and the posts they&apos;re filling.{" "}
          {openPosts > 0 && (
            <>
              <span className="text-foreground font-medium">{openPosts}</span> open{" "}
              {openPosts === 1 ? "post shows" : "posts show"} on the public careers page.
            </>
          )}
        </p>
        <Button onClick={() => setPartnerDialog({ open: true, partner: null })} className="shrink-0">
          <Plus className="size-4" /> Add hiring partner
        </Button>
      </div>

      {partners.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No hiring partners yet"
          description="Add the companies that hire your candidates, then list the posts they're filling."
        />
      ) : (
        <div className="space-y-4">
          {partners.map((partner) => (
            <Card key={partner.id} className={partner.isActive ? "" : "opacity-75"}>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-lg">
                      <Building2 className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">
                        {partner.name}
                        {!partner.isActive && <Badge variant="outline">Inactive</Badge>}
                      </p>
                      <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
                        {partner.city && <span>{partner.city}</span>}
                        {partner.website && (
                          <a
                            href={websiteHref(partner.website)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-foreground inline-flex items-center gap-0.5"
                          >
                            Website <ExternalLink className="size-3" />
                          </a>
                        )}
                      </p>
                      <div className="mt-2">
                        <PartnerContact partner={partner} />
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onViewCandidates(partner.id)}
                      className="hover:bg-muted rounded-lg border px-3 py-1.5 text-left"
                    >
                      <p className="text-lg leading-none font-semibold tabular-nums">
                        {partner.candidates}
                      </p>
                      <p className="text-muted-foreground text-[11px]">candidates</p>
                    </button>
                    <div className="rounded-lg border px-3 py-1.5">
                      <p className="text-lg leading-none font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">
                        {partner.placed}
                      </p>
                      <p className="text-muted-foreground text-[11px]">hired</p>
                    </div>
                    <Switch
                      checked={partner.isActive}
                      disabled={busy === `${BASE}/${partner.id}`}
                      onCheckedChange={(isActive) =>
                        patch(
                          `${BASE}/${partner.id}`,
                          { isActive },
                          isActive ? `${partner.name} is active.` : `${partner.name} deactivated.`,
                        )
                      }
                      aria-label={`${partner.name} active`}
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="icon-sm" />}
                        aria-label="Actions"
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setPostDialog({ open: true, partner, post: null })}
                        >
                          <Plus className="size-4" /> Add post
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onViewCandidates(partner.id)}>
                          <Users className="size-4" /> View candidates
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setPartnerDialog({ open: true, partner })}>
                          <Pencil className="size-4" /> Edit partner
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleting({ kind: "partner", partner })}
                        >
                          <Trash2 className="size-4" /> Delete partner
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Posts */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      Posts{" "}
                      <span className="text-muted-foreground font-normal">
                        ({partner.posts.length})
                      </span>
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPostDialog({ open: true, partner, post: null })}
                    >
                      <Plus className="size-4" /> Add post
                    </Button>
                  </div>
                  {partner.posts.length === 0 ? (
                    <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
                      No posts yet — add the roles this company is hiring for.
                    </p>
                  ) : (
                    <ul className="divide-y rounded-lg border">
                      {partner.posts.map((post) => (
                        <li
                          key={post.id}
                          className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                              <button
                                type="button"
                                onClick={() => setPostDialog({ open: true, partner, post })}
                                className="hover:text-primary text-left transition-colors"
                              >
                                {post.title}
                              </button>
                              <LevelBadge level={post.level} />
                              {!post.isOpen && <Badge variant="outline">Closed</Badge>}
                            </p>
                            <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                              {post.openings != null && (
                                <span>
                                  {post.openings} {post.openings === 1 ? "opening" : "openings"}
                                </span>
                              )}
                              {post.location && (
                                <span className="inline-flex items-center gap-0.5">
                                  <MapPin className="size-3" /> {post.location}
                                </span>
                              )}
                              {post.mode && <span>{JOB_MODE_LABELS[post.mode]}</span>}
                              {post.salary && (
                                <span className="inline-flex items-center gap-0.5">
                                  <IndianRupee className="size-3" /> {post.salary}
                                </span>
                              )}
                              <span>
                                {post.candidates} candidate{post.candidates === 1 ? "" : "s"} ·{" "}
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  {post.placed} hired
                                </span>
                              </span>
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="text-muted-foreground text-xs">
                              {post.isOpen ? "Open" : "Closed"}
                            </span>
                            <Switch
                              size="sm"
                              checked={post.isOpen}
                              disabled={busy === `${POSTS}/${post.id}`}
                              onCheckedChange={(isOpen) =>
                                patch(
                                  `${POSTS}/${post.id}`,
                                  { isOpen },
                                  isOpen ? "Post reopened." : "Post closed.",
                                )
                              }
                              aria-label={`${post.title} open`}
                            />
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Edit post"
                              onClick={() => setPostDialog({ open: true, partner, post })}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Delete post"
                              className="text-destructive"
                              onClick={() => setDeleting({ kind: "post", post })}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PartnerDialog
        open={partnerDialog.open}
        onOpenChange={(open) => setPartnerDialog((d) => ({ ...d, open }))}
        partner={partnerDialog.partner}
        basePath={BASE}
        noun="hiring partner"
        onSaved={() => router.refresh()}
      />

      <PostDialog
        open={postDialog.open}
        onOpenChange={(open) => setPostDialog((d) => ({ ...d, open }))}
        partner={postDialog.partner}
        post={postDialog.post}
        onSaved={() => router.refresh()}
      />

      <AlertDialog open={deleting != null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleting?.kind === "partner"
                ? `Delete ${deleting.partner.name}?`
                : `Delete the post “${deleting?.kind === "post" ? deleting.post.title : ""}”?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.kind === "partner"
                ? `Its ${deleting.partner.posts.length} post${deleting.partner.posts.length === 1 ? "" : "s"} go with it. Candidates stay on record, just no longer linked to this company — to keep the history, switch it off instead.`
                : "Candidates filed against this post stay with the company. To keep the history, close the post instead."}
            </AlertDialogDescription>
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

interface PostForm {
  title: string;
  level: ExperienceLevel;
  openings: string;
  location: string;
  mode: JobMode | typeof NO_MODE;
  salary: string;
  description: string;
  isOpen: boolean;
}

function PostDialog({
  open,
  onOpenChange,
  partner,
  post,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partner: HiringPartnerRow | null;
  post: HiringPostRow | null;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {open && partner && (
          <PostBody
            key={post?.id ?? `new-${partner.id}`}
            partner={partner}
            post={post}
            onDone={() => {
              onOpenChange(false);
              onSaved();
            }}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PostBody({
  partner,
  post,
  onDone,
  onCancel,
}: {
  partner: HiringPartnerRow;
  post: HiringPostRow | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<PostForm>(() => ({
    title: post?.title ?? "",
    level: post?.level ?? "FRESHER",
    openings: post?.openings != null ? String(post.openings) : "",
    location: post?.location ?? "",
    mode: post?.mode ?? NO_MODE,
    salary: post?.salary ?? "",
    description: post?.description ?? "",
    isOpen: post?.isOpen ?? true,
  }));
  const [saving, setSaving] = useState(false);

  function set<K extends keyof PostForm>(key: K, value: PostForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = {
      ...form,
      openings: form.openings.trim() || null,
      mode: form.mode === NO_MODE ? null : form.mode,
    };
    setSaving(true);
    try {
      if (post) await api.patch(`${POSTS}/${post.id}`, body);
      else await api.post(`${BASE}/${partner.id}/posts`, body);
      toast.success(post ? "Post saved." : "Post added.");
      onDone();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't save the post."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{post ? "Edit post" : "Add a post"}</DialogTitle>
        <DialogDescription>At {partner.name}.</DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="hp-title">Job title</Label>
          <Input
            id="hp-title"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. Medical Coder (CPC)"
            required
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>For</Label>
            <Select value={form.level} onValueChange={(v) => v && set("level", v as ExperienceLevel)}>
              <SelectTrigger className="w-full">
                <SelectValue>{(v) => EXPERIENCE_LEVEL_LABELS[v as ExperienceLevel]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {EXPERIENCE_LEVELS.map((l) => (
                  <SelectItem key={l} value={l}>
                    {EXPERIENCE_LEVEL_LABELS[l]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hp-openings">Openings</Label>
            <Input
              id="hp-openings"
              inputMode="numeric"
              value={form.openings}
              onChange={(e) => set("openings", e.target.value.replace(/[^\d]/g, ""))}
              placeholder="e.g. 5"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hp-location">Location</Label>
            <Input
              id="hp-location"
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
              placeholder="e.g. Noida"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Mode</Label>
            <Select value={form.mode} onValueChange={(v) => v && set("mode", v as PostForm["mode"])}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(v) => (v === NO_MODE ? "Not specified" : JOB_MODE_LABELS[v as JobMode])}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_MODE}>Not specified</SelectItem>
                {JOB_MODES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {JOB_MODE_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hp-salary">Salary</Label>
          <Input
            id="hp-salary"
            value={form.salary}
            onChange={(e) => set("salary", e.target.value)}
            placeholder="e.g. 2.4–3 LPA"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hp-desc">Description</Label>
          <Textarea
            id="hp-desc"
            rows={4}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="What the job involves and who it suits. Shown on the careers page while the post is open."
          />
        </div>
        <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
          <span>
            <span className="font-medium">Open</span>
            <span className="text-muted-foreground block text-xs">
              Open posts at active partners are listed on the public careers page.
            </span>
          </span>
          <Switch checked={form.isOpen} onCheckedChange={(v) => set("isOpen", v)} />
        </label>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || form.title.trim().length < 2}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {post ? "Save" : "Add post"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
