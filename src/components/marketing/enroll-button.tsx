"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowRight, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/shared/button-link";

export function EnrollButton({
  courseId,
  slug,
  isAuthed,
  isEnrolled,
  isFree,
}: {
  courseId: string;
  slug: string;
  isAuthed: boolean;
  isEnrolled: boolean;
  isFree: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (!isAuthed) {
    return (
      <ButtonLink href={`/login?next=/courses/${slug}`} size="lg" className="w-full">
        Sign in to enroll
      </ButtonLink>
    );
  }

  if (isEnrolled) {
    return (
      <ButtonLink href={`/student/learn/${slug}`} size="lg" className="w-full">
        <PlayCircle className="size-4" /> Go to course
      </ButtonLink>
    );
  }

  async function enroll() {
    setLoading(true);
    try {
      await api.post("/api/enrollments", { courseId });
      toast.success("You're enrolled! 🎉");
      router.push(`/student/learn/${slug}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't enroll.");
      setLoading(false);
    }
  }

  return (
    <Button onClick={enroll} disabled={loading} size="lg" className="w-full">
      {loading ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
      {isFree ? "Enroll for free" : "Enroll now"}
    </Button>
  );
}
