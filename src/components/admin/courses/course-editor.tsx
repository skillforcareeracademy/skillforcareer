"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Send, Undo2, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CourseDetailsForm } from "./course-details-form";
import { CurriculumBuilder } from "./curriculum-builder";
import type { CourseEdit } from "@/server/services/course-service";

export function CourseEditor({
  course,
  categories,
  basePath = "/admin/courses",
}: {
  course: CourseEdit;
  categories: { id: string; name: string }[];
  /** Route prefix for the "back to courses" link — `/instructor/courses` in the instructor workspace. */
  basePath?: string;
}) {
  const router = useRouter();
  const [publishing, setPublishing] = useState(false);
  const published = course.status === "PUBLISHED";

  async function togglePublish() {
    setPublishing(true);
    try {
      await api.post(`/api/courses/${course.id}/publish`, { publish: !published });
      toast.success(!published ? "Course published." : "Course unpublished.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Action failed.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            href={basePath}
            className="text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1 text-sm"
          >
            <ArrowLeft className="size-4" /> Back to courses
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {course.title}
            </h1>
            <Badge
              variant="secondary"
              className={
                published
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                  : ""
              }
            >
              {published
                ? "Published"
                : course.status.charAt(0) + course.status.slice(1).toLowerCase()}
            </Badge>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {published && (
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/courses/${course.slug}`} target="_blank" />}
            >
              View <ExternalLink className="size-4" />
            </Button>
          )}
          <Button
            onClick={togglePublish}
            disabled={publishing}
            variant={published ? "outline" : "default"}
          >
            {publishing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : published ? (
              <Undo2 className="size-4" />
            ) : (
              <Send className="size-4" />
            )}
            {published ? "Unpublish" : "Publish"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="curriculum">
            Curriculum
            <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">
              {course.chapters.reduce((n, c) => n + c.lessons.length, 0)}
            </Badge>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="mt-6">
          <CourseDetailsForm course={course} categories={categories} />
        </TabsContent>
        <TabsContent value="curriculum" className="mt-6">
          <CurriculumBuilder courseId={course.id} chapters={course.chapters} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
