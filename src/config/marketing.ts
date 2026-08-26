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
 * Presentation-only constants for the public marketing site.
 *
 * The words and pictures on the homepage are *not* here — they live in the
 * `HomeSection` table and are edited under Admin → Homepage; the shipped
 * defaults are in `lib/validations/homepage`. What remains is styling the
 * database has no opinion about.
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
