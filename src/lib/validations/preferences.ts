import { z } from "zod";

/** Learner notification toggles. Persisted under `User.preferences.notifications`. */
export const notificationPrefsSchema = z.object({
  emailAnnouncements: z.boolean(),
  emailCourseUpdates: z.boolean(),
  emailLiveClassReminders: z.boolean(),
  emailAssignmentGraded: z.boolean(),
  emailDiscussionReplies: z.boolean(),
  productTips: z.boolean(),
});

export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  emailAnnouncements: true,
  emailCourseUpdates: true,
  emailLiveClassReminders: true,
  emailAssignmentGraded: true,
  emailDiscussionReplies: true,
  productTips: false,
};

export const NOTIFICATION_FIELDS: {
  key: keyof NotificationPrefs;
  label: string;
  description: string;
}[] = [
  {
    key: "emailCourseUpdates",
    label: "Course updates",
    description: "New lessons, content changes and instructor notes in your courses.",
  },
  {
    key: "emailLiveClassReminders",
    label: "Live class reminders",
    description: "A heads-up before a live class in your courses goes live.",
  },
  {
    key: "emailAssignmentGraded",
    label: "Assignment graded",
    description: "When an instructor grades one of your submissions.",
  },
  {
    key: "emailDiscussionReplies",
    label: "Discussion replies",
    description: "When someone replies to a discussion you started.",
  },
  {
    key: "emailAnnouncements",
    label: "Announcements",
    description: "Important platform and program announcements.",
  },
  {
    key: "productTips",
    label: "Product tips & offers",
    description: "Occasional tips, new programs and promotions.",
  },
];
