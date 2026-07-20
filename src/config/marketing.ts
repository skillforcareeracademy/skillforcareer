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

export type ProgramBadge = "Bestseller" | "Popular" | "New" | "Placement";

export interface Program {
  title: string;
  partner: string; // fictional institute
  category: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  durationMonths: number;
  rating: number;
  learners: string;
  price: string;
  badge?: ProgramBadge;
  gradient: string;
  icon: LucideIcon;
  image: string;
  highlights: string[];
}

export const PROGRAMS: Program[] = [
  {
    title: "Executive PG Program in Data Science",
    partner: "SkillForCareer Institute of Technology",
    category: "Data Science",
    level: "Intermediate",
    durationMonths: 12,
    rating: 4.8,
    learners: "42.7k",
    price: "₹1,49,000",
    badge: "Bestseller",
    gradient: "from-rose-500 to-pink-600",
    icon: Database,
    image: pexels(19809475),
    highlights: ["360° career support", "Live mentor sessions", "12+ industry projects"],
  },
  {
    title: "Advanced Certificate in Generative AI",
    partner: "National School of AI",
    category: "AI & Machine Learning",
    level: "Advanced",
    durationMonths: 6,
    rating: 4.9,
    learners: "28.3k",
    price: "₹89,000",
    badge: "New",
    gradient: "from-violet-500 to-purple-600",
    icon: BrainCircuit,
    image: pexels(16323454),
    highlights: ["Build LLM apps", "Hands-on labs", "Capstone project"],
  },
  {
    title: "MBA (Global) — Digital Leadership",
    partner: "Global Business School",
    category: "Management & MBA",
    level: "Intermediate",
    durationMonths: 18,
    rating: 4.7,
    learners: "15.1k",
    price: "₹4,25,000",
    badge: "Popular",
    gradient: "from-amber-500 to-orange-600",
    icon: Briefcase,
    image: pexels(16323434),
    highlights: ["Dual credential", "Global immersion", "Alumni network"],
  },
  {
    title: "Full-Stack Software Development Bootcamp",
    partner: "SkillForCareer Academy",
    category: "Software Development",
    level: "Beginner",
    durationMonths: 9,
    rating: 4.8,
    learners: "63.9k",
    price: "₹99,000",
    badge: "Placement",
    gradient: "from-sky-500 to-blue-600",
    icon: Code2,
    image: pexels(26834970),
    highlights: ["Job guarantee", "500+ hiring partners", "Real-world projects"],
  },
  {
    title: "Professional Certificate in Cloud & DevOps",
    partner: "Institute of Cloud Engineering",
    category: "Cloud & DevOps",
    level: "Intermediate",
    durationMonths: 8,
    rating: 4.6,
    learners: "19.4k",
    price: "₹79,000",
    badge: "Popular",
    gradient: "from-cyan-500 to-blue-600",
    icon: Cloud,
    image: pexels(18067562),
    highlights: ["AWS + Azure labs", "CI/CD pipelines", "Industry mentor"],
  },
  {
    title: "Product Management Career Track",
    partner: "Global Business School",
    category: "Product Management",
    level: "Intermediate",
    durationMonths: 7,
    rating: 4.7,
    learners: "22.8k",
    price: "₹1,10,000",
    badge: "Bestseller",
    gradient: "from-fuchsia-500 to-pink-600",
    icon: Boxes,
    image: pexels(18870185),
    highlights: ["Real product sprints", "PM mentor circle", "Portfolio build"],
  },
];

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

export const GOALS: string[] = [
  "Data Science",
  "Generative AI",
  "MBA",
  "Software Development",
  "Digital Marketing",
  "Product Management",
];
