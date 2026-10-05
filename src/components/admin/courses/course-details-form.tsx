"use client";

import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RichTextEditor } from "@/components/shared/rich-text-editor";
import { ImageUpload } from "@/components/shared/image-upload";
import { SearchSelect } from "@/components/shared/search-select";
import {
  COURSE_LEVELS,
  DELIVERY_MODES,
  DELIVERY_MODE_LABEL,
  PRICING_TYPES,
  type CoursePageDisplay,
} from "@/lib/validations/course";
import type { CourseEdit } from "@/server/services/course-service";

const LEVEL_LABEL: Record<string, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  ALL_LEVELS: "All levels",
};

const PRICING_LABEL: Record<string, string> = {
  FREE: "Free",
  PAID: "Paid",
  SUBSCRIPTION: "Subscription",
};

interface FormValues {
  title: string;
  subtitle: string;
  slug: string;
  categoryId: string;
  level: string;
  deliveryMode: string;
  language: string;
  pricingType: string;
  price: number;
  discountPrice: string;
  thumbnailUrl: string;
  promoVideoUrl: string;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const placeholder = `Choose ${label.toLowerCase()}`;
  return (
    <Field label={label}>
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger className="w-full">
          {/* Base UI renders the raw value unless given a function child — map it
              back to the option label so we don't show ids/enum constants. */}
          <SelectValue placeholder={placeholder}>
            {(v) => options.find((o) => o.value === v)?.label ?? placeholder}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

/**
 * One line of the course-page display card: a switch that hides the figure
 * outright, and a box for what to print in place of the real one while it is
 * still too small to be worth printing.
 */
function DisplayRow({
  label,
  live,
  on,
  onToggle,
  stand,
  onStand,
  placeholder,
}: {
  label: string;
  live: string;
  on: boolean;
  onToggle: (next: boolean) => void;
  stand?: string;
  onStand?: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
      <Switch checked={on} onCheckedChange={onToggle} aria-label={label} />
      <div className="min-w-32 flex-1 basis-40">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-muted-foreground truncate text-xs">
          Live: {live || "—"}
        </p>
      </div>
      {onStand && (
        <Input
          value={stand ?? ""}
          disabled={!on}
          onChange={(e) => onStand(e.target.value)}
          placeholder={placeholder ?? "Show this instead…"}
          className="h-9 w-full sm:w-48"
        />
      )}
    </div>
  );
}

export function CourseDetailsForm({
  course,
  categories,
  instructors,
}: {
  course: CourseEdit;
  categories: { id: string; name: string }[];
  instructors: { id: string; name: string }[];
}) {
  const [description, setDescription] = useState(course.description ?? "");
  const [objectives, setObjectives] = useState(
    (course.objectives ?? []).join("\n"),
  );
  const [requirements, setRequirements] = useState(
    (course.requirements ?? []).join("\n"),
  );
  const [tags, setTags] = useState((course.tags ?? []).join(", "));
  const [instructorId, setInstructorId] = useState(course.instructorId);
  const [display, setDisplay] = useState<CoursePageDisplay>(course.pageDisplay);

  const setShow = <K extends keyof CoursePageDisplay>(
    key: K,
    value: CoursePageDisplay[K],
  ) => setDisplay((d) => ({ ...d, [key]: value }));

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      title: course.title,
      subtitle: course.subtitle ?? "",
      slug: course.slug ?? "",
      categoryId: course.categoryId,
      level: course.level,
      deliveryMode: course.deliveryMode,
      language: course.language,
      pricingType: course.pricingType,
      price: course.price,
      discountPrice:
        course.discountPrice != null ? String(course.discountPrice) : "",
      thumbnailUrl: course.thumbnailUrl ?? "",
      promoVideoUrl: course.promoVideoUrl ?? "",
    },
  });

  const pricingType = watch("pricingType");
  const lines = (s: string) =>
    s
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
  const commaList = (s: string) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

  async function onSubmit(v: FormValues) {
    const payload = {
      title: v.title,
      subtitle: v.subtitle,
      slug: v.slug,
      description,
      thumbnailUrl: v.thumbnailUrl,
      promoVideoUrl: v.promoVideoUrl,
      categoryId: v.categoryId,
      instructorId,
      level: v.level,
      deliveryMode: v.deliveryMode,
      language: v.language || "en",
      pricingType: v.pricingType,
      price: v.pricingType === "FREE" ? 0 : Number(v.price) || 0,
      discountPrice: v.discountPrice ? Number(v.discountPrice) : undefined,
      tags: commaList(tags),
      requirements: lines(requirements),
      objectives: lines(objectives),
      pageDisplay: display,
    };
    try {
      await api.patch(`/api/courses/${course.id}`, payload);
      toast.success("Course saved.");
    } catch (e) {
      if (e instanceof ApiError) {
        const details = e.details as
          { issues?: { message: string }[] } | undefined;
        toast.error(details?.issues?.[0]?.message ?? e.message);
      } else {
        toast.error("Save failed.");
      }
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="grid gap-6 lg:grid-cols-3"
    >
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Basics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Title">
              <Input {...register("title")} />
            </Field>
            <Field label="Subtitle">
              <Input {...register("subtitle")} placeholder="One-line summary" />
            </Field>
            <Field label="Description">
              <RichTextEditor value={description} onChange={setDescription} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What students will learn</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field
              label="Learning objectives (one per line)"
              hint="The first three appear as the bullet points on the course card."
            >
              <Textarea
                rows={4}
                value={objectives}
                onChange={(e) => setObjectives(e.target.value)}
              />
            </Field>
            <Field label="Requirements (one per line)">
              <Textarea
                rows={3}
                value={requirements}
                onChange={(e) => setRequirements(e.target.value)}
              />
            </Field>
            <Field label="Tags (comma separated)">
              <Input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="python, data, sql"
              />
            </Field>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Organise</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SelectField
              label="Category"
              value={watch("categoryId")}
              onChange={(v) => setValue("categoryId", v)}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
            {/* "I can not change this, as an admin I should be able to manage
                this." Whoever is picked here is credited on the course page and
                owns the course in the instructor workspace. */}
            <Field label="Instructor">
              <SearchSelect
                ariaLabel="Instructor"
                options={instructors.map((i) => ({ id: i.id, label: i.name }))}
                value={instructorId}
                onChange={(id) => id && setInstructorId(id)}
                placeholder="Choose an instructor"
                searchPlaceholder="Search instructors…"
                emptyLabel="No instructor matches that."
              />
            </Field>
            <SelectField
              label="Level"
              value={watch("level")}
              onChange={(v) => setValue("level", v)}
              options={COURSE_LEVELS.map((l) => ({
                value: l,
                label: LEVEL_LABEL[l],
              }))}
            />
            <SelectField
              label="Class mode"
              value={watch("deliveryMode")}
              onChange={(v) => setValue("deliveryMode", v)}
              options={DELIVERY_MODES.map((m) => ({
                value: m,
                label: DELIVERY_MODE_LABEL[m],
              }))}
            />
            <Field label="Language">
              <Input {...register("language")} />
            </Field>
            <Field label="Slug">
              <Input {...register("slug")} placeholder="auto from title" />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pricing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SelectField
              label="Pricing type"
              value={pricingType}
              onChange={(v) => setValue("pricingType", v)}
              options={PRICING_TYPES.map((p) => ({
                value: p,
                label: PRICING_LABEL[p],
              }))}
            />
            {pricingType !== "FREE" && (
              <>
                <Field label="Price (₹)">
                  <Input type="number" {...register("price")} />
                </Field>
                <Field label="Discount price (₹)">
                  <Input
                    type="number"
                    {...register("discountPrice")}
                    placeholder="optional"
                  />
                </Field>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Media</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Two ways in: upload a file, or paste a link from a stock site
                (Freepik, Pexels, Unsplash…). Both write the same field, and the
                preview shows exactly what the course card will render. */}
            <Field label="Thumbnail">
              <ImageUpload
                value={watch("thumbnailUrl") ?? ""}
                onChange={(url) =>
                  setValue("thumbnailUrl", url, { shouldDirty: true })
                }
                label="thumbnail"
                previewClassName="h-16 w-28"
              />
            </Field>
            <Field label="…or paste an image URL">
              <Input
                {...register("thumbnailUrl")}
                placeholder="https://img.freepik.com/… · https://images.pexels.com/…"
              />
            </Field>
            <Field label="Promo video URL">
              <Input {...register("promoVideoUrl")} placeholder="https://…" />
            </Field>
          </CardContent>
        </Card>

        {/* What the public course page prints. Every figure can be switched off,
            and any of the numbers can be given a stand-in to show while the real
            one is still small — "agar mai live publish nhi krna chahta to waha
            pr dummy data daalne ka option de do". */}
        <Card>
          <CardHeader>
            <CardTitle>Course page display</CardTitle>
            <CardDescription>
              Choose what visitors see in the course page header. Leave a box
              empty to print the live figure.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y py-0">
            <DisplayRow
              label="Rating"
              live={
                course.ratingCount > 0
                  ? `${course.ratingAvg.toFixed(1)} (${course.ratingCount})`
                  : "no reviews yet"
              }
              on={display.showRating}
              onToggle={(v) => setShow("showRating", v)}
              stand={display.ratingText}
              onStand={(v) => setShow("ratingText", v)}
              placeholder="e.g. 4.8"
            />
            <DisplayRow
              label="Reviews count"
              live={String(course.ratingCount)}
              on={display.showRating}
              onToggle={(v) => setShow("showRating", v)}
              stand={display.ratingCountText}
              onStand={(v) => setShow("ratingCountText", v)}
              placeholder="e.g. 240"
            />
            <DisplayRow
              label="Lessons"
              live={`${course.lessonCount} lessons`}
              on={display.showLessons}
              onToggle={(v) => setShow("showLessons", v)}
              stand={display.lessonsText}
              onStand={(v) => setShow("lessonsText", v)}
              placeholder="e.g. 60+ lessons"
            />
            <DisplayRow
              label="Learners enrolled"
              live={`${course.enrollmentCount} enrolled`}
              on={display.showEnrollments}
              onToggle={(v) => setShow("showEnrollments", v)}
              stand={display.enrollmentsText}
              onStand={(v) => setShow("enrollmentsText", v)}
              placeholder="e.g. 1,200+ enrolled"
            />
            <DisplayRow
              label="Total content time"
              live={
                course.durationMinutes > 0
                  ? `${course.durationMinutes} min`
                  : "not set"
              }
              on={display.showDuration}
              onToggle={(v) => setShow("showDuration", v)}
              stand={display.durationText}
              onStand={(v) => setShow("durationText", v)}
              placeholder="e.g. 48h of content"
            />
            <DisplayRow
              label="Level"
              live={LEVEL_LABEL[watch("level")] ?? watch("level")}
              on={display.showLevel}
              onToggle={(v) => setShow("showLevel", v)}
            />
            <DisplayRow
              label="Language"
              live={(watch("language") || "en").toUpperCase()}
              on={display.showLanguage}
              onToggle={(v) => setShow("showLanguage", v)}
            />
            <DisplayRow
              label="Instructor"
              live={instructors.find((i) => i.id === instructorId)?.name ?? "—"}
              on={display.showInstructor}
              onToggle={(v) => setShow("showInstructor", v)}
              stand={display.instructorName}
              onStand={(v) => setShow("instructorName", v)}
              placeholder="Show this name instead"
            />
            <DisplayRow
              label="Instructor headline"
              live="from their profile"
              on={display.showInstructor}
              onToggle={(v) => setShow("showInstructor", v)}
              stand={display.instructorHeadline}
              onStand={(v) => setShow("instructorHeadline", v)}
              placeholder="e.g. Lead trainer, 10 yrs"
            />
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          Save changes
        </Button>
      </div>
    </form>
  );
}
