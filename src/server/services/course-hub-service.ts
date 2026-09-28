import { prisma } from "@/lib/prisma";
import { listStudentMeetings, type StudentMeeting } from "./live-service";
import { listStudentBatchNotes, type StudentBatchNote } from "./batch-note-service";
import { listStudentAssignments, type StudentAssignment } from "./student-assignment-service";
import { listStudentQuizzes, type StudentQuiz } from "./student-quiz-service";
import { listCurriculumsForLearner, type CurriculumRow } from "./curriculum-plan-service";
import { listWebinarsForStudent, type StudentWebinar } from "./webinar-service";
import type { BatchSchedule } from "@/lib/validations/batch";

/**
 * One course, everything about it.
 *
 * "My Learning me course wise sab kuch hona chahiye — curriculum, batch detail,
 * lectures, notes, assignments, quizzes, webinars, upcoming classes,
 * recordings." The learner had to visit seven pages to assemble that; this is
 * the course's own home, and each section links on to the page that owns it.
 *
 * Composed from the services that already answer each question, filtered to
 * this course, so a rule about who may see what is never written twice.
 */

export interface HubLesson {
  id: string;
  title: string;
  type: string;
  durationSeconds: number;
  completed: boolean;
}

export interface HubChapter {
  id: string;
  title: string;
  lessons: HubLesson[];
}

export interface CourseHub {
  course: {
    id: string;
    slug: string;
    title: string;
    subtitle: string | null;
    thumbnailUrl: string | null;
    level: string;
    deliveryMode: string;
    categoryName: string | null;
    instructorName: string | null;
  };
  enrolment: {
    status: string;
    enrolledAt: string;
    progressPercent: number;
    lessonsTotal: number;
    lessonsCompleted: number;
  };
  batch: {
    id: string;
    name: string;
    startDate: string | null;
    endDate: string | null;
    schedule: BatchSchedule | null;
    instructorName: string | null;
    classesHeld: number;
    classesAttended: number;
    attendancePercent: number | null;
  } | null;
  chapters: HubChapter[];
  /** Classes still to come for this course or cohort, soonest first. */
  upcomingClasses: StudentMeeting[];
  /** Classes already held whose recording this learner may watch. */
  recordings: StudentMeeting[];
  notes: StudentBatchNote[];
  assignments: StudentAssignment[];
  quizzes: StudentQuiz[];
  curriculums: CurriculumRow[];
  /** Webinars are academy-wide; the hub shows the next few. */
  webinars: StudentWebinar[];
}

export async function getCourseHub(
  userId: string,
  email: string,
  slug: string,
): Promise<CourseHub | null> {
  const course = await prisma.course.findFirst({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      subtitle: true,
      thumbnailUrl: true,
      level: true,
      deliveryMode: true,
      category: { select: { name: true } },
      instructor: { select: { name: true } },
    },
  });
  if (!course) return null;

  const enrolment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId: course.id } },
    select: {
      status: true,
      enrolledAt: true,
      progressPercent: true,
      batchId: true,
      batch: {
        select: {
          id: true,
          name: true,
          startDate: true,
          endDate: true,
          schedule: true,
          instructor: { select: { name: true } },
        },
      },
    },
  });
  if (!enrolment) return null;

  const [chapters, progress, meetings, notes, assignments, quizzes, curriculums, webinars, attendance] =
    await Promise.all([
      prisma.chapter.findMany({
        where: { courseId: course.id },
        orderBy: { order: "asc" },
        select: {
          id: true,
          title: true,
          lessons: {
            orderBy: { order: "asc" },
            select: { id: true, title: true, type: true, durationSeconds: true },
          },
        },
      }),
      prisma.lessonProgress.findMany({
        where: { userId, lesson: { chapter: { courseId: course.id } } },
        select: { lessonId: true, completed: true },
      }),
      listStudentMeetings(userId),
      listStudentBatchNotes(userId),
      listStudentAssignments(userId),
      listStudentQuizzes(userId),
      listCurriculumsForLearner(userId),
      listWebinarsForStudent(userId, email),
      enrolment.batchId
        ? prisma.$queryRaw<{ held: bigint; attended: bigint | null }[]>`
            SELECT COUNT(*) AS held,
                   SUM(CASE WHEN a.status IN ('PRESENT', 'LATE', 'LEFT_EARLY') THEN 1 ELSE 0 END)
                     AS attended
              FROM Meeting m
              LEFT JOIN Attendance a ON a.meetingId = m.id AND a.userId = ${userId}
             WHERE m.batchId = ${enrolment.batchId}
               AND m.status <> 'CANCELLED'
               AND m.scheduledStart <= NOW()`
        : Promise.resolve([]),
    ]);

  const done = new Set(progress.filter((p) => p.completed).map((p) => p.lessonId));
  const hubChapters: HubChapter[] = chapters.map((c) => ({
    id: c.id,
    title: c.title,
    lessons: c.lessons.map((l) => ({
      id: l.id,
      title: l.title,
      type: l.type,
      durationSeconds: l.durationSeconds,
      completed: done.has(l.id),
    })),
  }));
  const lessonsTotal = hubChapters.reduce((s, c) => s + c.lessons.length, 0);
  const lessonsCompleted = hubChapters.reduce(
    (s, c) => s + c.lessons.filter((l) => l.completed).length,
    0,
  );

  // This course's own classes: its cohort's, or the course-wide ones.
  const mine = meetings.filter(
    (m) =>
      m.courseTitle === course.title ||
      (enrolment.batch && m.batchName === enrolment.batch.name),
  );
  const held = Number(attendance[0]?.held ?? 0);
  const attended = Number(attendance[0]?.attended ?? 0);

  return {
    course: {
      id: course.id,
      slug: course.slug,
      title: course.title,
      subtitle: course.subtitle,
      thumbnailUrl: course.thumbnailUrl,
      level: course.level,
      deliveryMode: course.deliveryMode,
      categoryName: course.category?.name ?? null,
      instructorName: course.instructor?.name ?? null,
    },
    enrolment: {
      status: enrolment.status,
      enrolledAt: enrolment.enrolledAt.toISOString(),
      progressPercent: Math.round(enrolment.progressPercent),
      lessonsTotal,
      lessonsCompleted,
    },
    batch: enrolment.batch
      ? {
          id: enrolment.batch.id,
          name: enrolment.batch.name,
          startDate: enrolment.batch.startDate?.toISOString() ?? null,
          endDate: enrolment.batch.endDate?.toISOString() ?? null,
          schedule: (enrolment.batch.schedule as BatchSchedule | null) ?? null,
          instructorName: enrolment.batch.instructor?.name ?? null,
          classesHeld: held,
          classesAttended: attended,
          attendancePercent: held > 0 ? Math.round((attended / held) * 100) : null,
        }
      : null,
    chapters: hubChapters,
    upcomingClasses: mine
      .filter((m) => m.phase === "upcoming" || m.phase === "live")
      .slice(0, 8),
    recordings: mine.filter((m) => m.phase === "past" && m.recording.available).slice(0, 12),
    notes: enrolment.batch
      ? notes.filter((n) => n.batchName === enrolment.batch!.name)
      : [],
    assignments: assignments.filter((a) => a.courseId === course.id),
    quizzes: quizzes.filter((q) => q.courseId === course.id),
    curriculums: curriculums.filter(
      (c) =>
        c.courseIds.includes(course.id) ||
        (enrolment.batchId ? c.batchIds.includes(enrolment.batchId) : false),
    ),
    webinars: webinars
      .filter((w) => new Date(w.scheduledStart).getTime() > Date.now() - 3_600_000)
      .slice(0, 4),
  };
}
