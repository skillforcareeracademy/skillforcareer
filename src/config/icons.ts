import {
  Award,
  BadgeCheck,
  BookOpen,
  BrainCircuit,
  BriefcaseBusiness,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Cloud,
  Code2,
  Compass,
  CreditCard,
  Database,
  GraduationCap,
  HeartHandshake,
  Laptop,
  LifeBuoy,
  ListChecks,
  Megaphone,
  MessagesSquare,
  MonitorPlay,
  Palette,
  PhoneCall,
  Radio,
  Rocket,
  Share2,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trophy,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * The glyphs an admin can pick for a homepage card, step or bullet.
 *
 * Kept deliberately short and named for what they *mean* on this site rather
 * than exposing the whole lucide set: the picker has to be scannable, and every
 * icon here has to look right at the 24px the marketing cards draw it at.
 * Icon choices are stored by these keys, so renaming one orphans saved content —
 * add new entries instead.
 */
export const ICONS = {
  MonitorPlay,
  Radio,
  ClipboardCheck,
  Award,
  BriefcaseBusiness,
  Users,
  BookOpen,
  GraduationCap,
  Laptop,
  Code2,
  Database,
  BrainCircuit,
  Megaphone,
  Palette,
  Cloud,
  Rocket,
  Target,
  Compass,
  ListChecks,
  PhoneCall,
  MessagesSquare,
  LifeBuoy,
  HeartHandshake,
  ShieldCheck,
  BadgeCheck,
  CheckCircle2,
  Star,
  Trophy,
  Sparkles,
  Share2,
  Building2,
  CreditCard,
  Wallet,
  Clock,
  Calendar,
} as const;

export type IconName = keyof typeof ICONS;

export const ICON_NAMES = Object.keys(ICONS) as IconName[];

/** Resolve a stored icon name, falling back so a bad value can't blank a card. */
export function iconFor(name: string | undefined, fallback: IconName = "Sparkles"): LucideIcon {
  return ICONS[name as IconName] ?? ICONS[fallback];
}

/**
 * Card accents, as Tailwind gradient pairs. Stored by key so the palette can be
 * retuned centrally without rewriting saved content.
 */
export const TINTS = {
  rose: { label: "Rose", gradient: "from-rose-500 to-pink-600" },
  violet: { label: "Violet", gradient: "from-violet-500 to-purple-600" },
  amber: { label: "Amber", gradient: "from-amber-500 to-orange-600" },
  emerald: { label: "Emerald", gradient: "from-emerald-500 to-teal-600" },
  sky: { label: "Sky", gradient: "from-sky-500 to-blue-600" },
  fuchsia: { label: "Fuchsia", gradient: "from-fuchsia-500 to-pink-600" },
  cyan: { label: "Cyan", gradient: "from-cyan-500 to-blue-600" },
  indigo: { label: "Indigo", gradient: "from-indigo-500 to-violet-600" },
} as const;

export type TintName = keyof typeof TINTS;

export const TINT_NAMES = Object.keys(TINTS) as TintName[];

export function gradientFor(name: string | undefined): string {
  return (TINTS[name as TintName] ?? TINTS.rose).gradient;
}

/**
 * Flat icon colours for inline trust/benefit lines. Amber is filled — it is the
 * rating star, and an outlined star reads as "not rated".
 */
export const TONES = {
  amber: { label: "Gold (filled)", className: "fill-amber-400 text-amber-400" },
  emerald: { label: "Green", className: "text-emerald-500" },
  rose: { label: "Brand rose", className: "text-rose-500" },
  sky: { label: "Blue", className: "text-sky-500" },
  violet: { label: "Violet", className: "text-violet-500" },
  slate: { label: "Neutral", className: "text-muted-foreground" },
} as const;

export type ToneName = keyof typeof TONES;

export const TONE_NAMES = Object.keys(TONES) as ToneName[];

export function toneFor(name: string | undefined): string {
  return (TONES[name as ToneName] ?? TONES.rose).className;
}
