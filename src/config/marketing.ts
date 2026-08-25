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

export interface Faq {
  question: string;
  answer: string;
}

/**
 * The questions the admissions team actually fields, lifted from the client's
 * live site (skillforcareer.in) so the two read as one brand.
 */
export const FAQS: Faq[] = [
  {
    question: "What is the duration of your courses?",
    answer:
      "Our IT courses typically run 2 to 6 months, depending on the course and the depth of training. Fast-track batches are available for students who want to finish sooner.",
  },
  {
    question: "When do new batches start?",
    answer:
      "New batches start every week for major courses like Web Development, Data Science and Digital Marketing. Weekend and evening batches are available too.",
  },
  {
    question: "Do you offer EMI or instalment options?",
    answer:
      "Yes — most courses can be paid in easy EMIs or instalments, and you can pick a plan that suits you at admission.",
  },
  {
    question: "Are fees the same for offline and online classes?",
    answer:
      "Almost identical. The course content and mentor support are the same either way, so both modes get the same quality of training.",
  },
  {
    question: "Do you provide live classes or recordings?",
    answer:
      "Both. Sessions are live and interactive, and every class is recorded for revision — with lifetime access to recordings on selected courses.",
  },
  {
    question: "Do you provide a certificate after the course?",
    answer:
      "Yes. Every student who clears the assessments receives a recognised completion certificate, verifiable online and ready for job applications.",
  },
  {
    question: "Do you offer placement assistance?",
    answer:
      "Yes — resume building, mock interviews, job alerts and company referrals. Students with strong project work get the best opportunities.",
  },
  {
    question: "What if the syllabus is updated after I join?",
    answer:
      "You get the updated modules automatically. We revise the curriculum regularly in line with what the industry is hiring for.",
  },
  {
    question: "What is your refund policy?",
    answer:
      "Refunds are available under the conditions set out in our refund policy. Our support team can walk you through whether yours qualifies, and updates are sent to your registered email or WhatsApp.",
  },
];

export interface ProcessStep {
  title: string;
  body: string;
}

/** "Steps for your successful career" — the client's four-stage journey. */
export const PROCESS_STEPS: ProcessStep[] = [
  {
    title: "Career counselling",
    body: "Talk to a counsellor about where you are now and what you want next — free, and with no obligation to enrol.",
  },
  {
    title: "Course selection",
    body: "Pick the programme that fits your goal, your schedule and your budget, with EMI options if you need them.",
  },
  {
    title: "Learning & internship",
    body: "Live classes, recordings, assignments and real project work — followed by an internship to put it to use.",
  },
  {
    title: "Placement & earning",
    body: "Resume help, mock interviews, job alerts and company referrals until you land the role.",
  },
];
