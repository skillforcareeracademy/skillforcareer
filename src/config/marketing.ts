import {
  BookOpen,
  Database,
  BrainCircuit,
  Briefcase,
  Code2,
  Megaphone,
  Boxes,
  Cloud,
  Palette,
  type LucideIcon,
} from "lucide-react";

/**
 * Sample marketing content for the public landing. Placeholder data only —
 * real catalog data comes from the database (Step 6). Partner/institute names
 * are fictional to avoid using real trademarks.
 */

/**
 * Per-category glyph and tint, keyed by the category slug in the database.
 * Only presentation lives here — names and course counts come from the catalogue,
 * so a category the admin renames or empties can't leave a stale number behind.
 */
export interface CategoryStyle {
  icon: LucideIcon;
  gradient: string;
}

export const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  "data-science": { icon: Database, gradient: "from-rose-500 to-pink-600" },
  "ai-ml": { icon: BrainCircuit, gradient: "from-violet-500 to-purple-600" },
  management: { icon: Briefcase, gradient: "from-amber-500 to-orange-600" },
  "software-development": { icon: Code2, gradient: "from-sky-500 to-blue-600" },
  "digital-marketing": { icon: Megaphone, gradient: "from-emerald-500 to-teal-600" },
  "product-management": { icon: Boxes, gradient: "from-fuchsia-500 to-pink-600" },
  "cloud-devops": { icon: Cloud, gradient: "from-cyan-500 to-blue-600" },
  design: { icon: Palette, gradient: "from-indigo-500 to-violet-600" },
};

export const DEFAULT_CATEGORY_STYLE: CategoryStyle = {
  icon: BookOpen,
  gradient: "from-rose-500 to-pink-600",
};

/**
 * 16:9 Pexels thumbnail, face-aware cropped so people's heads stay in frame
 * (Pexels supports `crop=faces`). Matches the CourseCard's aspect-video frame.
 */
export function pexels(id: number, w = 800): string {
  const h = Math.round((w * 9) / 16);
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}&h=${h}&fit=crop&crop=faces`;
}

/** Square, face-cropped Pexels portrait for avatars. */
export function pexelsAvatar(id: number, size = 200): string {
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${size}&h=${size}&fit=crop&crop=faces`;
}

export interface Testimonial {
  name: string;
  role: string;
  quote: string;
  initials: string;
  avatar: string;
  accent: string;
}

// Real learner reviews + headshots from the client's live site (skillforcareer.in).
export const TESTIMONIALS: Testimonial[] = [
  {
    name: "Rohit Chakravarti",
    role: "SkillForCareer learner",
    quote:
      "Amazing experience! The faculty is supportive and the environment truly helps in building skills and confidence.",
    initials: "RC",
    avatar: "https://skillforcareer.in/wp-content/uploads/2026/02/Rohit-Chakravarti.jpeg",
    accent: "from-rose-500 to-pink-600",
  },
  {
    name: "Anjali Rajput",
    role: "Digital Marketing track",
    quote:
      "Excellent training and great mentors. I gained confidence, practical skills, and a clear career direction.",
    initials: "AR",
    avatar: "https://skillforcareer.in/wp-content/uploads/2026/02/anjali.jpeg",
    accent: "from-violet-500 to-purple-600",
  },
  {
    name: "Rakesh",
    role: "SkillForCareer learner",
    quote:
      "Affordable fees with quality education and professional guidance. The trainers genuinely care about your growth.",
    initials: "R",
    avatar: "https://skillforcareer.in/wp-content/uploads/2026/07/nt12.png",
    accent: "from-sky-500 to-blue-600",
  },
];

/** Face avatars for the hero "trusted by" cluster (Indian learners). */
export const HERO_AVATARS: string[] = [
  pexelsAvatar(7580822),
  pexelsAvatar(9171219),
  pexelsAvatar(7580821),
  pexelsAvatar(7580761),
];

export interface Stat {
  value: string;
  label: string;
}

/** The academy's own figures — supplied by the client, not placeholders. */
export const STATS: Stat[] = [
  { value: "1,000+", label: "Learners upskilled" },
  { value: "100+", label: "Hiring partners" },
  { value: "50+", label: "Courses & programs" },
  { value: "98%", label: "Completion rate" },
];
