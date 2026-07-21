import {
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

export interface Category {
  name: string;
  slug: string;
  icon: LucideIcon;
  courses: number;
  gradient: string; // tailwind from/to classes for the tile
}

export const CATEGORIES: Category[] = [
  { name: "Data Science", slug: "data-science", icon: Database, courses: 128, gradient: "from-rose-500 to-pink-600" },
  { name: "AI & Machine Learning", slug: "ai-ml", icon: BrainCircuit, courses: 96, gradient: "from-violet-500 to-purple-600" },
  { name: "Management & MBA", slug: "management", icon: Briefcase, courses: 74, gradient: "from-amber-500 to-orange-600" },
  { name: "Software Development", slug: "software-development", icon: Code2, courses: 152, gradient: "from-sky-500 to-blue-600" },
  { name: "Digital Marketing", slug: "digital-marketing", icon: Megaphone, courses: 63, gradient: "from-emerald-500 to-teal-600" },
  { name: "Product Management", slug: "product-management", icon: Boxes, courses: 41, gradient: "from-fuchsia-500 to-pink-600" },
  { name: "Cloud & DevOps", slug: "cloud-devops", icon: Cloud, courses: 58, gradient: "from-cyan-500 to-blue-600" },
  { name: "Design & UX", slug: "design", icon: Palette, courses: 47, gradient: "from-indigo-500 to-violet-600" },
];

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

export const STATS: Stat[] = [
  { value: "10M+", label: "Learners upskilled" },
  { value: "500+", label: "Hiring partners" },
  { value: "1,000+", label: "Courses & programs" },
  { value: "92%", label: "Completion rate" },
];
