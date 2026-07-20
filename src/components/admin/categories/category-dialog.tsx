"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { categorySchema, type CategoryInput } from "@/lib/validations/category";
import { api, ApiError } from "@/lib/api-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CategoryRow } from "@/server/services/category-service";

const NONE = "none";

// Form works with the schema's *input* type (coerced `order`); handleSubmit
// hands `onSubmit` the parsed *output* type (CategoryInput).
type CategoryFormValues = z.input<typeof categorySchema>;

const EMPTY: CategoryFormValues = {
  name: "",
  slug: "",
  description: "",
  icon: "",
  order: 0,
  isActive: true,
  parentId: "",
};

export function CategoryDialog({
  open,
  onOpenChange,
  editing,
  parents,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: CategoryRow | null;
  parents: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormValues, unknown, CategoryInput>({
    resolver: zodResolver(categorySchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!open) return;
    reset(
      editing
        ? {
            name: editing.name,
            slug: editing.slug,
            description: editing.description ?? "",
            icon: editing.icon ?? "",
            order: editing.order,
            isActive: editing.isActive,
            parentId: editing.parentId ?? "",
          }
        : EMPTY,
    );
  }, [open, editing, reset]);

  const isActive = watch("isActive");
  const parentId = watch("parentId");

  async function onSubmit(values: CategoryInput) {
    try {
      if (editing) {
        await api.patch(`/api/admin/categories/${editing.id}`, values);
        toast.success("Category updated.");
      } else {
        await api.post("/api/admin/categories", values);
        toast.success("Category created.");
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Something went wrong.");
    }
  }

  const parentOptions = parents.filter((p) => p.id !== editing?.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit category" : "New category"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update this category's details."
              : "Add a new course category."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Name</Label>
            <Input id="cat-name" placeholder="Data Science" {...register("name")} />
            {errors.name && (
              <p className="text-destructive text-xs">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cat-slug">
              Slug <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="cat-slug"
              placeholder="auto-generated from name"
              {...register("slug")}
            />
            {errors.slug && (
              <p className="text-destructive text-xs">{errors.slug.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cat-desc">Description</Label>
            <Textarea id="cat-desc" rows={2} {...register("description")} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cat-order">Order</Label>
              <Input id="cat-order" type="number" {...register("order")} />
            </div>
            <div className="space-y-1.5">
              <Label>Parent</Label>
              <Select
                value={parentId ? parentId : NONE}
                onValueChange={(v) => setValue("parentId", !v || v === NONE ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {parentOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="cat-active">Active</Label>
              <p className="text-muted-foreground text-xs">Visible in the catalog</p>
            </div>
            <Switch
              id="cat-active"
              checked={isActive ?? true}
              onCheckedChange={(v) => setValue("isActive", v)}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              {editing ? "Save changes" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
