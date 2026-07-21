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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RichTextEditor } from "@/components/shared/rich-text-editor";
import { ImageUpload } from "@/components/shared/image-upload";
import {
  COURSE_LEVELS,
  DELIVERY_MODES,
  PRICING_TYPES,
} from "@/lib/validations/course";
import type { CourseEdit } from "@/server/services/course-service";

const LEVEL_LABEL: Record<string, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  ALL_LEVELS: "All levels",
};
const MODE_LABEL: Record<string, string> = {
  SELF_PACED: "Self-paced",
  LIVE: "Live",
  HYBRID: "Hybrid",
  OFFLINE: "Offline",
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

export function CourseDetailsForm({
  course,
  categories,
}: {
  course: CourseEdit;
  categories: { id: string; name: string }[];
}) {
  const [description, setDescription] = useState(course.description ?? "");
  const [objectives, setObjectives] = useState((course.objectives ?? []).join("\n"));
  const [requirements, setRequirements] = useState((course.requirements ?? []).join("\n"));
  const [tags, setTags] = useState((course.tags ?? []).join(", "));

  const { register, handleSubmit, watch, setValue, formState: { isSubmitting } } =
    useForm<FormValues>({
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
        discountPrice: course.discountPrice != null ? String(course.discountPrice) : "",
        thumbnailUrl: course.thumbnailUrl ?? "",
        promoVideoUrl: course.promoVideoUrl ?? "",
      },
    });

  const pricingType = watch("pricingType");
  const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
  const commaList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  async function onSubmit(v: FormValues) {
    const payload = {
      title: v.title,
      subtitle: v.subtitle,
      slug: v.slug,
      description,
      thumbnailUrl: v.thumbnailUrl,
      promoVideoUrl: v.promoVideoUrl,
      categoryId: v.categoryId,
      level: v.level,
      deliveryMode: v.deliveryMode,
      language: v.language || "en",
      pricingType: v.pricingType,
      price: v.pricingType === "FREE" ? 0 : Number(v.price) || 0,
      discountPrice: v.discountPrice ? Number(v.discountPrice) : undefined,
      tags: commaList(tags),
      requirements: lines(requirements),
      objectives: lines(objectives),
    };
    try {
      await api.patch(`/api/courses/${course.id}`, payload);
      toast.success("Course saved.");
    } catch (e) {
      if (e instanceof ApiError) {
        const details = e.details as { issues?: { message: string }[] } | undefined;
        toast.error(details?.issues?.[0]?.message ?? e.message);
      } else {
        toast.error("Save failed.");
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-6 lg:grid-cols-3">
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
              <Textarea rows={4} value={objectives} onChange={(e) => setObjectives(e.target.value)} />
            </Field>
            <Field label="Requirements (one per line)">
              <Textarea rows={3} value={requirements} onChange={(e) => setRequirements(e.target.value)} />
            </Field>
            <Field label="Tags (comma separated)">
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="python, data, sql" />
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
            <SelectField label="Category" value={watch("categoryId")} onChange={(v) => setValue("categoryId", v)} options={categories.map((c) => ({ value: c.id, label: c.name }))} />
            <SelectField label="Level" value={watch("level")} onChange={(v) => setValue("level", v)} options={COURSE_LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] }))} />
            <SelectField label="Delivery" value={watch("deliveryMode")} onChange={(v) => setValue("deliveryMode", v)} options={DELIVERY_MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }))} />
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
            <SelectField label="Pricing type" value={pricingType} onChange={(v) => setValue("pricingType", v)} options={PRICING_TYPES.map((p) => ({ value: p, label: PRICING_LABEL[p] }))} />
            {pricingType !== "FREE" && (
              <>
                <Field label="Price (₹)">
                  <Input type="number" {...register("price")} />
                </Field>
                <Field label="Discount price (₹)">
                  <Input type="number" {...register("discountPrice")} placeholder="optional" />
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
