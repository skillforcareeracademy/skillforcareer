"use client";

import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface CourseOption {
  id: string;
  title: string;
  categoryId: string;
  categoryName: string;
  subCategoryId: string;
  subCategoryName: string;
}

/**
 * Pick a course the way the academy files them.
 *
 * Its catalogue runs to a few dozen courses across fourteen subjects, and a
 * flat alphabetical list of them is no use when you are setting a paper:
 * "yahan pr courses category and subcategory k according dikhne chahiye taaki
 * courses select krna easy ho jaaye." So two narrowing selects sit above the
 * course, and the course list shows what survives them.
 *
 * The filters are a view, not a value — nothing about them is saved. Choosing
 * a course from outside the current filter still works, because the filters
 * reset to whatever that course is filed under.
 */
export function CourseCategoryPicker({
  courses,
  value,
  onChange,
  category,
  subCategory,
  onCategoryChange,
  onSubCategoryChange,
  label = "Course",
  allowNone = true,
  noneLabel = "No course",
}: {
  courses: CourseOption[];
  value: string;
  onChange: (courseId: string) => void;
  category: string;
  subCategory: string;
  onCategoryChange: (id: string) => void;
  onSubCategoryChange: (id: string) => void;
  label?: string;
  allowNone?: boolean;
  noneLabel?: string;
}) {
  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of courses) {
      if (c.categoryId && !seen.has(c.categoryId)) {
        seen.set(c.categoryId, c.categoryName);
      }
    }
    return [...seen].map(([id, name]) => ({ id, name }));
  }, [courses]);

  const subCategories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of courses) {
      if (category && c.categoryId !== category) continue;
      if (c.subCategoryId && !seen.has(c.subCategoryId)) {
        seen.set(c.subCategoryId, c.subCategoryName);
      }
    }
    return [...seen].map(([id, name]) => ({ id, name }));
  }, [courses, category]);

  const shown = useMemo(
    () =>
      courses.filter(
        (c) =>
          (!category || c.categoryId === category) &&
          (!subCategory || c.subCategoryId === subCategory),
      ),
    [courses, category, subCategory],
  );

  // A course already chosen must stay choosable even when the filters above it
  // would hide it — otherwise opening an existing quiz blanks its course.
  const list = useMemo(() => {
    if (!value || shown.some((c) => c.id === value)) return shown;
    const chosen = courses.find((c) => c.id === value);
    return chosen ? [chosen, ...shown] : shown;
  }, [shown, courses, value]);

  const title = (id: string) =>
    courses.find((c) => c.id === id)?.title ?? noneLabel;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Course category</Label>
          <Select
            value={category || "all"}
            onValueChange={(v) => {
              onCategoryChange(v === "all" ? "" : (v ?? ""));
              onSubCategoryChange("");
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {(v) =>
                  !v || v === "all"
                    ? "Every category"
                    : (categories.find((c) => c.id === v)?.name ?? "Every category")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Every category</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Course sub-category</Label>
          <Select
            value={subCategory || "all"}
            onValueChange={(v) => onSubCategoryChange(v === "all" ? "" : (v ?? ""))}
            disabled={subCategories.length === 0}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {(v) =>
                  !v || v === "all"
                    ? subCategories.length === 0
                      ? "None available"
                      : "Every sub-category"
                    : (subCategories.find((c) => c.id === v)?.name ?? "Every sub-category")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Every sub-category</SelectItem>
              {subCategories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>{label}</Label>
        <Select
          value={value || "none"}
          onValueChange={(v) => onChange(v === "none" ? "" : (v ?? ""))}
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              {(v) => (!v || v === "none" ? noneLabel : title(String(v)))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {allowNone && <SelectItem value="none">{noneLabel}</SelectItem>}
            {list.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.title}
                {c.categoryName && (
                  <span className="text-muted-foreground">
                    {" "}
                    · {c.categoryName}
                    {c.subCategoryName ? ` → ${c.subCategoryName}` : ""}
                  </span>
                )}
              </SelectItem>
            ))}
            {list.length === 0 && (
              <SelectItem value="none" disabled>
                No course under that category
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
