import { z } from "zod";
import { ICON_NAMES, TINT_NAMES, TONE_NAMES } from "@/config/icons";
import { SOCIAL_NAMES, SOCIAL_OPTIONS } from "@/config/social";
import { siteConfig } from "@/config/site";
import { CERTIFICATE_TYPES, CERTIFICATE_TYPE_META } from "./certificate";

/**
 * The homepage as editable content.
 *
 * Every band of the public landing page is described here once: a Zod schema
 * (what may be stored), a set of defaults (what the site shipped with, so a
 * fresh install renders the designed page before anyone touches it), and a
 * field spec (how Admin → Homepage draws the form). Keeping the three together
 * is deliberate — a section gains a field by being edited in one place, and the
 * admin form needs no bespoke code per section.
 *
 * Client-safe: the admin editor imports this in the browser, so nothing here
 * may reach for the database. Reads and writes live in
 * `server/services/homepage-service`.
 */

// ── Field specs (drive the admin form) ───────────────────────────────────────

export type FieldType =
  | "text"
  | "textarea"
  | "url"
  | "image"
  | "number"
  | "switch"
  | "icon"
  | "tint"
  | "tone"
  | "select";

export interface Field {
  name: string;
  label: string;
  type: FieldType;
  hint?: string;
  placeholder?: string;
  /** Take the full width of the two-column grid instead of one cell. */
  wide?: boolean;
  /** Required by `type: "select"` — the choices, in the order they're offered. */
  options?: readonly { value: string; label: string }[];
}

export interface ListField {
  name: string;
  label: string;
  type: "list";
  /** Singular noun for the "Add …" button and each row's heading. */
  itemLabel: string;
  /** Which sub-field titles a collapsed row. */
  titleKey: string;
  /**
   * A row's own fields. A list may hold another list — the footer's link
   * columns are a list of columns, each holding a list of links — so the editor
   * recurses. One level of nesting is all any section needs; deeper would stop
   * being legible in the form.
   */
  fields: (Field | ListField)[];
  max: number;
  hint?: string;
}

export type AnyField = Field | ListField;

export function isListField(field: AnyField): field is ListField {
  return field.type === "list";
}

// ── Zod helpers ──────────────────────────────────────────────────────────────

/** Optional free text. Trimmed, bounded, never null — blank means "hide it". */
const text = (max = 160) => z.string().trim().max(max).default("");
/** Text a section cannot render without; the default keeps a blank save safe. */
const required = (max = 160, fallback = "") =>
  z.string().trim().min(1, "This can't be empty").max(max).catch(fallback);
/** A link or media path — relative (`/courses`, `/api/files/…`) or absolute. */
const link = (max = 500) => z.string().trim().max(max).default("");
const icon = (fallback: string) =>
  z.enum(ICON_NAMES as [string, ...string[]]).catch(fallback as never);
const tint = z.enum(TINT_NAMES as [string, ...string[]]).catch("rose" as never);
const tone = z.enum(TONE_NAMES as [string, ...string[]]).catch("rose" as never);
const count = (max: number, fallback: number) =>
  z.coerce.number().int().min(1).max(max).catch(fallback);
const social = z.enum(SOCIAL_NAMES as [string, ...string[]]).catch("instagram" as never);

/** A navigation entry — used by the header, the footer columns and the legal row. */
const linkItem = z.object({ label: text(40), href: link(200) });
const linkFields: Field[] = [
  { name: "label", label: "Text", type: "text" },
  { name: "href", label: "Links to", type: "text", placeholder: "/courses" },
];

// ── Section: hero ────────────────────────────────────────────────────────────

const heroSchema = z.object({
  badgeText: text(80),
  avatars: z.array(z.object({ url: link() })).max(6).default([]),
  titleLead: text(60),
  titleHighlight: text(40),
  titleTail: text(60),
  subtitle: text(300),
  searchPlaceholder: text(80),
  showPopular: z.boolean().default(true),
  popularLabel: text(40),
  popularLimit: count(12, 6),
  trust: z
    .array(z.object({ icon: icon("Star"), text: text(60), tone }))
    .max(6)
    .default([]),
});

const heroFields: AnyField[] = [
  { name: "badgeText", label: "Badge above the heading", type: "text", placeholder: "Trusted by 1,000+ learners" },
  { name: "searchPlaceholder", label: "Search box placeholder", type: "text" },
  { name: "titleLead", label: "Heading — first part", type: "text", hint: "Shown in the normal text colour." },
  { name: "titleHighlight", label: "Heading — highlighted word", type: "text", hint: "Drawn in the brand gradient." },
  { name: "titleTail", label: "Heading — last part", type: "text" },
  { name: "subtitle", label: "Sub-heading", type: "textarea", wide: true },
  { name: "showPopular", label: "Show popular course chips", type: "switch", hint: "Pulled live from the catalogue's most-enrolled courses." },
  { name: "popularLimit", label: "How many chips", type: "number" },
  { name: "popularLabel", label: "Chips label", type: "text", placeholder: "Popular:" },
  {
    name: "avatars",
    label: "Badge avatars",
    type: "list",
    itemLabel: "avatar",
    titleKey: "url",
    max: 6,
    hint: "The small overlapping faces inside the badge.",
    fields: [{ name: "url", label: "Photo", type: "image" }],
  },
  {
    name: "trust",
    label: "Trust line",
    type: "list",
    itemLabel: "trust point",
    titleKey: "text",
    max: 6,
    hint: "The short proof points under the search box.",
    fields: [
      { name: "icon", label: "Icon", type: "icon" },
      { name: "text", label: "Text", type: "text" },
      { name: "tone", label: "Icon colour", type: "tone" },
    ],
  },
];

const heroDefaults: z.infer<typeof heroSchema> = {
  badgeText: "Trusted by 1,000+ learners",
  avatars: [
    { url: "https://images.pexels.com/photos/7580822/pexels-photo-7580822.jpeg?auto=compress&cs=tinysrgb&w=200&h=200&fit=crop&crop=faces" },
    { url: "https://images.pexels.com/photos/9171219/pexels-photo-9171219.jpeg?auto=compress&cs=tinysrgb&w=200&h=200&fit=crop&crop=faces" },
    { url: "https://images.pexels.com/photos/7580821/pexels-photo-7580821.jpeg?auto=compress&cs=tinysrgb&w=200&h=200&fit=crop&crop=faces" },
    { url: "https://images.pexels.com/photos/7580761/pexels-photo-7580761.jpeg?auto=compress&cs=tinysrgb&w=200&h=200&fit=crop&crop=faces" },
  ],
  titleLead: "Master tomorrow's",
  titleHighlight: "skills",
  titleTail: "today",
  subtitle:
    "Learn from industry experts with live classes, hands-on projects and verified certificates — and get the career support to land the job.",
  searchPlaceholder: "What do you want to learn?",
  showPopular: true,
  popularLabel: "Popular:",
  popularLimit: 6,
  trust: [
    { icon: "Star", text: "4.9/5 average rating", tone: "amber" },
    { icon: "ShieldCheck", text: "Verified certificates", tone: "emerald" },
    { icon: "Trophy", text: "900+ placements done", tone: "rose" },
  ],
};

// ── Section: stats ───────────────────────────────────────────────────────────

const statsSchema = z.object({
  items: z
    .array(z.object({ value: text(20), label: text(60) }))
    .max(8)
    .default([]),
});

const statsFields: AnyField[] = [
  {
    name: "items",
    label: "Figures",
    type: "list",
    itemLabel: "figure",
    titleKey: "value",
    max: 8,
    hint: "Four reads best — they sit on one row on desktop.",
    fields: [
      { name: "value", label: "Number", type: "text", placeholder: "1,000+" },
      { name: "label", label: "Caption", type: "text", placeholder: "Learners upskilled" },
    ],
  },
];

const statsDefaults: z.infer<typeof statsSchema> = {
  items: [
    { value: "1,000+", label: "Learners upskilled" },
    { value: "100+", label: "Hiring partners" },
    { value: "50+", label: "Courses & programs" },
    { value: "98%", label: "Completion rate" },
  ],
};

// ── Section: categories ──────────────────────────────────────────────────────

const categoriesSchema = z.object({
  title: required(120, "Explore top categories"),
  description: text(240),
  linkLabel: text(60),
  linkHref: link(),
  limit: count(24, 8),
});

const headingFields = (titlePlaceholder: string): AnyField[] => [
  { name: "title", label: "Heading", type: "text", placeholder: titlePlaceholder, wide: true },
  { name: "description", label: "Sub-heading", type: "textarea", wide: true },
];

const categoriesFields: AnyField[] = [
  ...headingFields("Explore top categories"),
  { name: "linkLabel", label: "Corner link text", type: "text", placeholder: "View all categories" },
  { name: "linkHref", label: "Corner link URL", type: "url", placeholder: "/courses" },
  {
    name: "limit",
    label: "Maximum tiles",
    type: "number",
    hint: "Tiles come from the catalogue — a category appears once it has a published course.",
  },
];

const categoriesDefaults: z.infer<typeof categoriesSchema> = {
  title: "Explore top categories",
  description: "Choose a domain and start building job-ready skills.",
  linkLabel: "View all categories",
  linkHref: "/courses",
  limit: 8,
};

// ── Section: programs ────────────────────────────────────────────────────────

const programsSchema = z.object({
  title: required(120, "Trending programs"),
  description: text(240),
  linkLabel: text(60),
  linkHref: link(),
  limit: count(12, 6),
});

const programsFields: AnyField[] = [
  ...headingFields("Trending programs"),
  { name: "linkLabel", label: "Corner link text", type: "text", placeholder: "Browse all programs" },
  { name: "linkHref", label: "Corner link URL", type: "url", placeholder: "/courses" },
  {
    name: "limit",
    label: "How many programs",
    type: "number",
    hint: "Featured courses first, then the most enrolled. Manage the courses themselves under Courses.",
  },
];

const programsDefaults: z.infer<typeof programsSchema> = {
  title: "Trending programs",
  description: "Industry-designed programs with mentorship and career support.",
  linkLabel: "Browse all programs",
  linkHref: "/courses",
  limit: 6,
};

// ── Section: why us ──────────────────────────────────────────────────────────

const whyUsSchema = z.object({
  title: required(120, "Everything a modern academy needs"),
  description: text(240),
  items: z
    .array(
      z.object({
        icon: icon("Sparkles"),
        title: text(80),
        description: text(300),
        tint,
      }),
    )
    .max(9)
    .default([]),
});

const whyUsFields: AnyField[] = [
  ...headingFields("Everything a modern academy needs"),
  {
    name: "items",
    label: "Benefit cards",
    type: "list",
    itemLabel: "benefit",
    titleKey: "title",
    max: 9,
    hint: "Three per row on desktop — multiples of three look tidiest.",
    fields: [
      { name: "title", label: "Title", type: "text" },
      { name: "icon", label: "Icon", type: "icon" },
      { name: "description", label: "Description", type: "textarea", wide: true },
      { name: "tint", label: "Accent colour", type: "tint" },
    ],
  },
];

const whyUsDefaults: z.infer<typeof whyUsSchema> = {
  title: "Everything a modern academy needs",
  description: "One platform for teaching, assessing, certifying and getting hired.",
  items: [
    {
      icon: "MonitorPlay",
      title: "Learn anytime",
      description:
        "Pre-recorded, live, offline and hybrid — with resume, notes, bookmarks and playback speed.",
      tint: "rose",
    },
    {
      icon: "Radio",
      title: "Live interactive classes",
      description:
        "Built-in conferencing with screen share, chat, raise-hand and recording-ready sessions.",
      tint: "violet",
    },
    {
      icon: "ClipboardCheck",
      title: "Real assessments",
      description:
        "Timed quizzes with auto or manual grading, plus assignments with feedback and rubrics.",
      tint: "amber",
    },
    {
      icon: "Award",
      title: "Verifiable certificates",
      description:
        "Auto-generated certificates with a unique verification code the moment you complete a course.",
      tint: "emerald",
    },
    {
      icon: "BriefcaseBusiness",
      title: "Career support",
      description:
        "Placement assistance, mock interviews and 100+ hiring partners to help you land the role.",
      tint: "sky",
    },
    {
      icon: "Users",
      title: "Mentor community",
      description:
        "1:1 mentorship, doubt-clearing and a peer community that keeps you accountable.",
      tint: "fuchsia",
    },
  ],
};

// ── Section: process ─────────────────────────────────────────────────────────

const processSchema = z.object({
  title: required(120, "Steps for your successful career"),
  description: text(240),
  items: z
    .array(z.object({ icon: icon("ListChecks"), title: text(80), body: text(300) }))
    .max(6)
    .default([]),
});

const processFields: AnyField[] = [
  ...headingFields("Steps for your successful career"),
  {
    name: "items",
    label: "Steps",
    type: "list",
    itemLabel: "step",
    titleKey: "title",
    max: 6,
    hint: "Numbered automatically, in this order. Four fit one row on desktop.",
    fields: [
      { name: "title", label: "Title", type: "text" },
      { name: "icon", label: "Icon", type: "icon" },
      { name: "body", label: "Description", type: "textarea", wide: true },
    ],
  },
];

const processDefaults: z.infer<typeof processSchema> = {
  title: "Steps for your successful career",
  description:
    "From the first counselling call to the offer letter — we stay with you the whole way.",
  items: [
    {
      icon: "PhoneCall",
      title: "Career counselling",
      body: "Talk to a counsellor about where you are now and what you want next — free, and with no obligation to enrol.",
    },
    {
      icon: "ListChecks",
      title: "Course selection",
      body: "Pick the programme that fits your goal, your schedule and your budget, with EMI options if you need them.",
    },
    {
      icon: "GraduationCap",
      title: "Learning & internship",
      body: "Live classes, recordings, assignments and real project work — followed by an internship to put it to use.",
    },
    {
      icon: "BriefcaseBusiness",
      title: "Placement & earning",
      body: "Resume help, mock interviews, job alerts and company referrals until you land the role.",
    },
  ],
};

// ── Section: placed students ─────────────────────────────────────────────────

const placedSchema = z.object({
  eyebrow: text(80),
  titleLead: text(40),
  titleHighlight: text(40),
  titleTail: text(40),
  items: z
    .array(z.object({ name: text(60), course: text(60), photo: link() }))
    .max(60)
    .default([]),
});

const placedFields: AnyField[] = [
  { name: "eyebrow", label: "Small line above the heading", type: "text", placeholder: "Skill For Career" },
  { name: "titleLead", label: "Heading — first part", type: "text", placeholder: "900+" },
  { name: "titleHighlight", label: "Heading — underlined word", type: "text", placeholder: "Students" },
  { name: "titleTail", label: "Heading — last part", type: "text", placeholder: "Got Placed" },
  {
    name: "items",
    label: "Learners",
    type: "list",
    itemLabel: "learner",
    titleKey: "name",
    max: 60,
    hint: "Split across two scrolling rows automatically, and repeated to fill the width. Add at least four.",
    fields: [
      { name: "name", label: "Name", type: "text" },
      { name: "course", label: "Course", type: "text" },
      { name: "photo", label: "Photo", type: "image", wide: true },
    ],
  },
];

const placedDefaults: z.infer<typeof placedSchema> = {
  eyebrow: "Skill For Career",
  titleLead: "900+",
  titleHighlight: "Students",
  titleTail: "Got Placed",
  items: [
    { name: "Himani", course: "Data Analyst", photo: "/images/students/student-11.png" },
    { name: "Sneha Yadav", course: "Web Development", photo: "/images/students/student-14.png" },
    { name: "Anjali Rajput", course: "Digital Marketing", photo: "/images/students/student-15.png" },
    { name: "Ajeet", course: "Retail & Sales", photo: "/images/students/student-16.png" },
    { name: "Priya Singh", course: "Full Stack Developer", photo: "/images/students/student-19.png" },
    { name: "Anu Chauhan", course: "Social Media Management", photo: "/images/students/student-20.png" },
    { name: "Bhumika Gandhi", course: "Digital Marketing", photo: "/images/students/student-6.png" },
    { name: "Neha Sharma", course: "Full Stack Developer", photo: "/images/students/student-1.png" },
    { name: "Raunak Bhatia", course: "Web Development", photo: "/images/students/student-4.png" },
    { name: "Ritika Verma", course: "Data Analyst", photo: "/images/students/student-5.png" },
  ],
};

// ── Section: testimonials ────────────────────────────────────────────────────

const testimonialsSchema = z.object({
  title: required(120, "Careers, transformed"),
  description: text(240),
  items: z
    .array(z.object({ name: text(60), role: text(80), quote: text(400), avatar: link() }))
    .max(12)
    .default([]),
});

const testimonialsFields: AnyField[] = [
  ...headingFields("Careers, transformed"),
  {
    name: "items",
    label: "Reviews",
    type: "list",
    itemLabel: "review",
    titleKey: "name",
    max: 12,
    hint: "Three per row on desktop.",
    fields: [
      { name: "name", label: "Name", type: "text" },
      { name: "role", label: "Role or track", type: "text" },
      { name: "quote", label: "Quote", type: "textarea", wide: true },
      { name: "avatar", label: "Photo", type: "image", wide: true },
    ],
  },
];

const testimonialsDefaults: z.infer<typeof testimonialsSchema> = {
  title: "Careers, transformed",
  description: "Real learners, real outcomes — promotions, switches and pay raises.",
  items: [
    {
      name: "Rohit Chakravarti",
      role: "SkillForCareer learner",
      quote:
        "Amazing experience! The faculty is supportive and the environment truly helps in building skills and confidence.",
      avatar: "https://skillforcareer.in/wp-content/uploads/2026/02/Rohit-Chakravarti.jpeg",
    },
    {
      name: "Anjali Rajput",
      role: "Digital Marketing track",
      quote:
        "Excellent training and great mentors. I gained confidence, practical skills, and a clear career direction.",
      avatar: "https://skillforcareer.in/wp-content/uploads/2026/02/anjali.jpeg",
    },
    {
      name: "Rakesh",
      role: "SkillForCareer learner",
      quote:
        "Affordable fees with quality education and professional guidance. The trainers genuinely care about your growth.",
      avatar: "https://skillforcareer.in/wp-content/uploads/2026/07/nt12.png",
    },
  ],
};

// ── Section: certificate showcase ────────────────────────────────────────────

const certificateSchema = z.object({
  badge: text(80),
  title: required(120, "Finish strong. Get certified."),
  description: text(400),
  perks: z.array(z.object({ icon: icon("BadgeCheck"), text: text(160) })).max(6).default([]),
  primaryLabel: text(40),
  primaryHref: link(),
  secondaryLabel: text(40),
  secondaryHref: link(),
  sampleLabel: text(40),
  sampleTemplate: z.enum(CERTIFICATE_TYPES).catch("COURSE_COMPLETION" as never),
  sampleStudentName: text(80),
  sampleCourseTitle: text(160),
  sampleSerialNumber: text(40),
  sampleIssuedAt: text(30),
  sampleBatchName: text(120),
  sampleDetail: text(200),
});

const certificateFields: AnyField[] = [
  { name: "badge", label: "Badge above the heading", type: "text", placeholder: "Industry-recognised certificate" },
  { name: "title", label: "Heading", type: "text" },
  { name: "description", label: "Sub-heading", type: "textarea", wide: true },
  {
    name: "perks",
    label: "Bullet points",
    type: "list",
    itemLabel: "point",
    titleKey: "text",
    max: 6,
    fields: [
      { name: "icon", label: "Icon", type: "icon" },
      { name: "text", label: "Text", type: "text", wide: true },
    ],
  },
  { name: "primaryLabel", label: "Primary button", type: "text", placeholder: "Start a course" },
  { name: "primaryHref", label: "Primary button URL", type: "url", placeholder: "/courses" },
  { name: "secondaryLabel", label: "Secondary button", type: "text", placeholder: "Verify a certificate" },
  { name: "secondaryHref", label: "Secondary button URL", type: "url", placeholder: "/verify" },
  {
    name: "sampleLabel",
    label: "Corner tag on the preview",
    type: "text",
    placeholder: "Sample certificate",
    hint: "The certificate beside this copy is a preview only — it carries the code SAMPLE and will not verify.",
  },
  {
    name: "sampleTemplate",
    label: "Which design to show",
    type: "select",
    options: CERTIFICATE_TYPES.map((t) => ({
      value: t,
      label: CERTIFICATE_TYPE_META[t].label,
    })),
    hint: "The same four designs the academy issues. Manage the real ones under Certificates.",
  },
  { name: "sampleStudentName", label: "Preview — learner name", type: "text" },
  { name: "sampleCourseTitle", label: "Preview — course title", type: "text", wide: true },
  { name: "sampleSerialNumber", label: "Preview — serial number", type: "text" },
  { name: "sampleIssuedAt", label: "Preview — issue date", type: "text", placeholder: "2026-02-14", hint: "Format: YYYY-MM-DD." },
  { name: "sampleBatchName", label: "Preview — batch", type: "text", placeholder: "Web Development Batch 1" },
  {
    name: "sampleDetail",
    label: "Preview — citation or period",
    type: "textarea",
    wide: true,
    hint: "Used by the appreciation and internship designs. Leave blank for their standard wording.",
  },
];

const certificateDefaults: z.infer<typeof certificateSchema> = {
  badge: "Industry-recognised certificate",
  title: "Finish strong. Get certified.",
  description:
    "Complete your program and earn a verifiable SkillForCareer certificate — proof of the skills you've built, ready to share with employers.",
  perks: [
    { icon: "BadgeCheck", text: "Verifiable — a unique code anyone can check" },
    { icon: "Share2", text: "Shareable on LinkedIn and your résumé" },
    { icon: "Building2", text: "Recognised by hiring partners across India" },
  ],
  primaryLabel: "Start a course",
  primaryHref: "/courses",
  secondaryLabel: "Verify a certificate",
  secondaryHref: "/verify",
  sampleLabel: "Sample certificate",
  sampleTemplate: "COURSE_COMPLETION",
  sampleStudentName: "Ananya Sharma",
  sampleCourseTitle: "Complete Data Science Bootcamp with Python",
  sampleSerialNumber: "SFC-2026-000420",
  sampleIssuedAt: "2026-02-14",
  sampleBatchName: "Data Science Batch 4",
  sampleDetail: "",
};

// ── Section: placement stories ───────────────────────────────────────────────

const storiesSchema = z.object({
  badge: text(60),
  title: required(120, "Our learners, now placed"),
  description: text(240),
  placedLabel: text(24),
  items: z
    .array(z.object({ name: text(60), company: text(60), quote: text(400), photo: link() }))
    .max(24)
    .default([]),
});

const storiesFields: AnyField[] = [
  { name: "badge", label: "Badge above the heading", type: "text", placeholder: "Placement stories" },
  { name: "placedLabel", label: "Photo tag", type: "text", placeholder: "Placed" },
  ...headingFields("Our learners, now placed"),
  {
    name: "items",
    label: "Stories",
    type: "list",
    itemLabel: "story",
    titleKey: "name",
    max: 24,
    hint: "Shown in a swipeable row — four visible at a time on a wide screen.",
    fields: [
      { name: "name", label: "Name", type: "text" },
      { name: "company", label: "Placed at", type: "text" },
      { name: "quote", label: "Quote", type: "textarea", wide: true },
      { name: "photo", label: "Photo", type: "image", wide: true },
    ],
  },
];

const storiesDefaults: z.infer<typeof storiesSchema> = {
  badge: "Placement stories",
  placedLabel: "Placed",
  title: "Our learners, now placed",
  description:
    "Real students, real offers — swipe through to see what changed after training at SkillForCareer.",
  items: [
    {
      name: "Ashish Kumar Shrivastava",
      company: "Omega Healthcare",
      quote: "The recruitment process was smooth, and the interview panel was supportive throughout.",
      photo: "https://skillforcareer.in/wp-content/uploads/2026/07/nt1.png",
    },
    {
      name: "Mayank Sharma",
      company: "Optum",
      quote: "The interview process was well organized, and I'm grateful for this opportunity.",
      photo: "https://skillforcareer.in/wp-content/uploads/2026/07/nt3.png",
    },
    {
      name: "Vishal Kaushik",
      company: "CorroHealth",
      quote: "I'm grateful for this opportunity — thank you Skill for Career for the guidance.",
      photo: "https://skillforcareer.in/wp-content/uploads/2026/07/nt4.png",
    },
    {
      name: "Harsh Sharma",
      company: "Pacific",
      quote: "Thank you Skill For Career for this opportunity and constant support.",
      photo: "https://skillforcareer.in/wp-content/uploads/2026/07/nt5.png",
    },
    {
      name: "Isha",
      company: "R1 RCM",
      quote: "I got placed at R1 RCM. Truly thankful to the Skill for Career Academy team.",
      photo: "https://skillforcareer.in/wp-content/uploads/2026/07/nt2.png",
    },
    {
      name: "Tushar",
      company: "Omega Healthcare",
      quote:
        "Happy to receive an offer from Omega Healthcare — a great opportunity to build my skills.",
      photo: "https://skillforcareer.in/wp-content/uploads/2026/07/nt6.png",
    },
  ],
};

// ── Section: learner videos ──────────────────────────────────────────────────

const videosSchema = z.object({
  badge: text(60),
  title: required(120, "Hear it in their words"),
  description: text(240),
  items: z
    .array(
      z.object({
        name: text(60),
        tag: text(60),
        poster: link(),
        video: link(),
        duration: text(10),
        quote: text(400),
        rated: z.boolean().default(false),
      }),
    )
    .max(24)
    .default([]),
});

const videosFields: AnyField[] = [
  { name: "badge", label: "Badge above the heading", type: "text", placeholder: "Learner stories" },
  ...headingFields("Hear it in their words"),
  {
    name: "items",
    label: "Reels",
    type: "list",
    itemLabel: "reel",
    titleKey: "name",
    max: 24,
    hint: "Portrait clips. The video file loads only when someone taps play, so give every reel a poster image.",
    fields: [
      { name: "name", label: "Name", type: "text" },
      { name: "tag", label: "Caption under the name", type: "text" },
      { name: "poster", label: "Poster image", type: "image", wide: true },
      { name: "video", label: "Video URL (.mp4)", type: "url", wide: true },
      { name: "duration", label: "Duration", type: "text", placeholder: "0:32" },
      { name: "rated", label: "Show five stars", type: "switch" },
      { name: "quote", label: "Quote shown while playing", type: "textarea", wide: true },
    ],
  },
];

const V = "https://skillforcareer.in/wp-content/uploads";

const videosDefaults: z.infer<typeof videosSchema> = {
  badge: "Learner stories",
  title: "Hear it in their words",
  description: "Real learners on camera — swipe through and tap any reel to watch.",
  items: [
    {
      name: "Arun",
      tag: "SkillForCareer learner",
      poster: "/images/learner-videos/arun.jpg",
      video: `${V}/2026/04/Arun.mp4`,
      duration: "0:15",
      quote:
        "Industry-focused training, real-world projects, and amazing guidance. Highly valuable for career development.",
      rated: true,
    },
    {
      name: "Afshah",
      tag: "Medical Coding student",
      poster: "/images/learner-videos/afshah.jpg",
      video: `${V}/2026/04/afshah.mp4`,
      duration: "0:46",
      quote:
        "Great learning experience with practical exposure and dedicated support. Truly helped me grow professionally.",
      rated: true,
    },
    {
      name: "Student story",
      tag: "In their own words",
      poster: "/images/learner-videos/student-story.jpg",
      video: `${V}/2026/01/testimonials2-1.mp4`,
      duration: "0:26",
      quote: "",
      rated: false,
    },
    {
      name: "Medical Coding",
      tag: "Course spotlight",
      poster: "/images/learner-videos/medical-coding.jpg",
      video: `${V}/2026/01/sfcv3-1.mp4`,
      duration: "0:49",
      quote: "",
      rated: false,
    },
    {
      name: "Skill For Career",
      tag: "Career reel",
      poster: "/images/learner-videos/reel-1.jpg",
      video: `${V}/2026/01/sfcv1-1.mp4`,
      duration: "0:34",
      quote: "",
      rated: false,
    },
    {
      name: "Skill For Career",
      tag: "Career reel",
      poster: "/images/learner-videos/reel-2.jpg",
      video: `${V}/2026/01/sfcv2-1.mp4`,
      duration: "0:30",
      quote: "",
      rated: false,
    },
    {
      name: "Skill For Career",
      tag: "Career reel",
      poster: "/images/learner-videos/reel-3.jpg",
      video: `${V}/2026/01/sfcv4-1.mp4`,
      duration: "0:28",
      quote: "",
      rated: false,
    },
  ],
};

// ── Section: FAQ ─────────────────────────────────────────────────────────────

const faqSchema = z.object({
  title: required(120, "Frequently asked questions"),
  description: text(300),
  ctaLabel: text(40),
  ctaHref: link(),
  items: z.array(z.object({ question: text(200), answer: text(1200) })).max(30).default([]),
});

const faqFields: AnyField[] = [
  ...headingFields("Frequently asked questions"),
  { name: "ctaLabel", label: "Button text", type: "text", placeholder: "Ask us anything" },
  { name: "ctaHref", label: "Button URL", type: "url", placeholder: "/contact" },
  {
    name: "items",
    label: "Questions",
    type: "list",
    itemLabel: "question",
    titleKey: "question",
    max: 30,
    fields: [
      { name: "question", label: "Question", type: "text", wide: true },
      { name: "answer", label: "Answer", type: "textarea", wide: true },
    ],
  },
];

const faqDefaults: z.infer<typeof faqSchema> = {
  title: "Frequently asked questions",
  description:
    "Everything students ask us before they enrol. Still unsure? Talk to a counsellor — it's free.",
  ctaLabel: "Ask us anything",
  ctaHref: "/contact",
  items: [
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
  ],
};

// ── Section: enquiry form ────────────────────────────────────────────────────

const enquirySchema = z.object({
  badge: text(60),
  title: required(120, "Talk to a course advisor"),
  description: text(400),
  bullets: z.array(z.object({ text: text(160) })).max(6).default([]),
  showContact: z.boolean().default(true),
  contactPhone: text(30),
  contactEmail: text(160),
  formTitle: text(60),
  formSubtitle: text(60),
  submitLabel: text(40),
  consentNote: text(200),
  successTitle: text(60),
  successBody: text(300),
});

const enquiryFields: AnyField[] = [
  { name: "badge", label: "Badge above the heading", type: "text", placeholder: "Free career counselling" },
  { name: "title", label: "Heading", type: "text" },
  { name: "description", label: "Sub-heading", type: "textarea", wide: true },
  {
    name: "bullets",
    label: "Bullet points",
    type: "list",
    itemLabel: "point",
    titleKey: "text",
    max: 6,
    fields: [{ name: "text", label: "Text", type: "text", wide: true }],
  },
  { name: "showContact", label: "Show phone and email", type: "switch" },
  { name: "contactPhone", label: "Phone", type: "text", hint: "Leave blank to use the number from Settings." },
  { name: "contactEmail", label: "Email", type: "text", hint: "Leave blank to use the address from Settings." },
  { name: "formTitle", label: "Form heading", type: "text", placeholder: "Request a callback" },
  { name: "formSubtitle", label: "Form sub-heading", type: "text", placeholder: "Takes under a minute" },
  { name: "submitLabel", label: "Submit button", type: "text", placeholder: "Request callback" },
  { name: "consentNote", label: "Small print under the button", type: "textarea", wide: true },
  { name: "successTitle", label: "Thank-you heading", type: "text" },
  { name: "successBody", label: "Thank-you message", type: "textarea", wide: true },
];

const enquiryDefaults: z.infer<typeof enquirySchema> = {
  badge: "Free career counselling",
  title: "Talk to a course advisor",
  description:
    "Not sure which program fits you? Share your details and our team will call you back with a personalised learning plan — no pressure, just guidance.",
  bullets: [
    { text: "1:1 guidance on the right course & batch" },
    { text: "Fees, EMI options and scholarships explained" },
    { text: "Career outcomes and placement support" },
  ],
  showContact: true,
  contactPhone: "",
  contactEmail: "",
  formTitle: "Request a callback",
  formSubtitle: "Takes under a minute",
  submitLabel: "Request callback",
  consentNote: "By submitting, you agree to be contacted about our programs.",
  successTitle: "Request received!",
  successBody: "Thanks for reaching out. Our team will call you back shortly.",
};

// ── Section: closing call to action ──────────────────────────────────────────

const ctaSchema = z.object({
  title: required(120, "Ready to build the career you want?"),
  description: text(240),
  primaryLabel: text(40),
  primaryHref: link(),
  secondaryLabel: text(40),
  secondaryHref: link(),
});

const ctaFields: AnyField[] = [
  { name: "title", label: "Heading", type: "text", wide: true },
  { name: "description", label: "Sub-heading", type: "textarea", wide: true },
  { name: "primaryLabel", label: "Primary button", type: "text" },
  { name: "primaryHref", label: "Primary button URL", type: "url" },
  { name: "secondaryLabel", label: "Secondary button", type: "text" },
  { name: "secondaryHref", label: "Secondary button URL", type: "url" },
];

const ctaDefaults: z.infer<typeof ctaSchema> = {
  title: "Ready to build the career you want?",
  description: "Join 1,000+ learners. Start free — upgrade when you're ready.",
  primaryLabel: "Get started free",
  primaryHref: "/register",
  secondaryLabel: "Talk to a counsellor",
  secondaryHref: "/contact",
};

// ── Section: header (site-wide) ──────────────────────────────────────────────

const headerSchema = z.object({
  navLinks: z.array(linkItem).max(8).default([]),
  showSearch: z.boolean().default(true),
  showThemeToggle: z.boolean().default(true),
  signInLabel: text(30),
  signInHref: link(200),
  ctaLabel: text(30),
  ctaHref: link(200),
});

const headerFields: AnyField[] = [
  {
    name: "navLinks",
    label: "Navigation links",
    type: "list",
    itemLabel: "link",
    titleKey: "label",
    max: 8,
    hint: "Shown across the top on desktop, and in the menu on a phone.",
    fields: linkFields,
  },
  {
    name: "showSearch",
    label: "Show the course search box",
    type: "switch",
    hint: "Searches the live catalogue.",
  },
  {
    name: "showThemeToggle",
    label: "Show the light/dark switch",
    type: "switch",
  },
  {
    name: "signInLabel",
    label: "Sign-in button text",
    type: "text",
    hint: "Leave blank to drop the button. Signed-in visitors see their profile menu instead.",
  },
  { name: "signInHref", label: "Sign-in button links to", type: "text" },
  {
    name: "ctaLabel",
    label: "Main button text",
    type: "text",
    hint: "Leave blank to drop the button.",
  },
  { name: "ctaHref", label: "Main button links to", type: "text" },
];

const headerDefaults: z.infer<typeof headerSchema> = {
  navLinks: [
    { label: "Courses", href: "/courses" },
    { label: "Categories", href: "/#categories" },
    { label: "Live Classes", href: "/live-classes" },
    { label: "For Business", href: "/for-business" },
  ],
  showSearch: true,
  showThemeToggle: true,
  signInLabel: "Sign in",
  signInHref: "/login",
  ctaLabel: "Get started",
  ctaHref: "/register",
};

// ── Section: footer (site-wide) ──────────────────────────────────────────────

const footerSchema = z.object({
  about: text(300),
  offices: z
    .array(z.object({ label: text(60), line1: text(120), line2: text(120) }))
    .max(4)
    .default([]),
  columns: z
    .array(z.object({ title: text(40), links: z.array(linkItem).max(8).default([]) }))
    .max(4)
    .default([]),
  contactTitle: text(40),
  phoneDisplay: text(30),
  phone: text(30),
  email: text(120),
  hours: text(60),
  socials: z.array(z.object({ platform: social, href: link(200) })).max(8).default([]),
  copyright: text(160),
  legalLinks: z.array(linkItem).max(5).default([]),
});

const footerFields: AnyField[] = [
  {
    name: "about",
    label: "Blurb under the logo",
    type: "textarea",
    wide: true,
    hint: "The logo itself is set in Settings → Branding.",
  },
  {
    name: "offices",
    label: "Addresses",
    type: "list",
    itemLabel: "address",
    titleKey: "label",
    max: 4,
    fields: [
      { name: "label", label: "Name", type: "text", placeholder: "Faridabad" },
      { name: "line1", label: "Address line 1", type: "text", wide: true },
      { name: "line2", label: "Address line 2", type: "text", wide: true },
    ],
  },
  {
    name: "columns",
    label: "Link columns",
    type: "list",
    itemLabel: "column",
    titleKey: "title",
    max: 4,
    hint: "The middle of the footer. Each column becomes a heading with its links under it.",
    fields: [
      { name: "title", label: "Column heading", type: "text", wide: true },
      {
        name: "links",
        label: "Links in this column",
        type: "list",
        itemLabel: "link",
        titleKey: "label",
        max: 8,
        fields: linkFields,
      },
    ],
  },
  { name: "contactTitle", label: "Contact heading", type: "text" },
  { name: "hours", label: "Opening hours", type: "text" },
  {
    name: "phoneDisplay",
    label: "Phone number, as shown",
    type: "text",
    placeholder: "+91 92204 03922",
  },
  {
    name: "phone",
    label: "Phone number, as dialled",
    type: "text",
    hint: "What tapping it calls — no spaces.",
    placeholder: "+919220403922",
  },
  { name: "email", label: "Email address", type: "text", wide: true },
  {
    name: "socials",
    label: "Social links",
    type: "list",
    itemLabel: "social link",
    titleKey: "href",
    max: 8,
    hint: "Pick the network and paste your page's address.",
    fields: [
      { name: "platform", label: "Network", type: "select", options: SOCIAL_OPTIONS },
      { name: "href", label: "Address", type: "text" },
    ],
  },
  {
    name: "copyright",
    label: "Copyright line",
    type: "text",
    wide: true,
    hint: "Write {year} where the current year should go.",
  },
  {
    name: "legalLinks",
    label: "Bottom links",
    type: "list",
    itemLabel: "link",
    titleKey: "label",
    max: 5,
    hint: "The small print beside the copyright.",
    fields: linkFields,
  },
];

const footerDefaults: z.infer<typeof footerSchema> = {
  about: siteConfig.description,
  offices: siteConfig.contact.offices.map((o) => ({
    label: o.label,
    line1: o.line1,
    line2: o.line2,
  })),
  columns: [
    {
      title: "Categories",
      links: [
        { label: "Data Science", href: "/courses?category=data-science" },
        { label: "AI & Machine Learning", href: "/courses?category=ai-ml" },
        { label: "Management & MBA", href: "/courses?category=management" },
        { label: "Software Development", href: "/courses?category=software-development" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "About us", href: "/about" },
        { label: "Careers", href: "/careers" },
        { label: "For Business", href: "/for-business" },
        { label: "Contact", href: "/contact" },
      ],
    },
    {
      title: "Resources",
      links: [
        { label: "Live classes", href: "/live-classes" },
        { label: "Webinars", href: "/webinars" },
        { label: "Browse courses", href: "/courses" },
        { label: "Verify certificate", href: "/verify" },
      ],
    },
  ],
  contactTitle: "Get in touch",
  phoneDisplay: siteConfig.contact.phoneDisplay,
  phone: siteConfig.contact.phone,
  email: siteConfig.contact.email,
  hours: siteConfig.contact.hours,
  socials: [
    { platform: "instagram", href: siteConfig.contact.social.instagram },
    { platform: "youtube", href: siteConfig.contact.social.youtube },
    { platform: "facebook", href: siteConfig.contact.social.facebook },
    { platform: "linkedin", href: siteConfig.contact.social.linkedin },
    { platform: "x", href: siteConfig.contact.social.x },
  ],
  copyright: `© {year} ${siteConfig.name}. All rights reserved.`,
  legalLinks: [
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
    { label: "Cookies", href: "/cookies" },
  ],
};

// ── The registry ─────────────────────────────────────────────────────────────

/**
 * Every editable section, in the order a fresh install renders them. `order` on
 * the stored row overrides this, so an admin can reshuffle the page; new
 * sections added in code land at the position given here.
 */
export const HOME_SECTIONS = {
  hero: {
    label: "Hero",
    description: "The first screen — headline, search box and trust line.",
    icon: "Sparkles",
    schema: heroSchema,
    fields: heroFields,
    defaults: heroDefaults,
  },
  stats: {
    label: "Key figures",
    description: "The four-across band of headline numbers.",
    icon: "Trophy",
    schema: statsSchema,
    fields: statsFields,
    defaults: statsDefaults,
  },
  categories: {
    label: "Top categories",
    description: "Category tiles, counted live from the catalogue.",
    icon: "Compass",
    schema: categoriesSchema,
    fields: categoriesFields,
    defaults: categoriesDefaults,
  },
  programs: {
    label: "Trending programs",
    description: "Course cards pulled from published courses.",
    icon: "BookOpen",
    schema: programsSchema,
    fields: programsFields,
    defaults: programsDefaults,
  },
  whyUs: {
    label: "Why us",
    description: "The grid of benefit cards.",
    icon: "Rocket",
    schema: whyUsSchema,
    fields: whyUsFields,
    defaults: whyUsDefaults,
  },
  process: {
    label: "How it works",
    description: "The numbered counselling-to-placement steps.",
    icon: "ListChecks",
    schema: processSchema,
    fields: processFields,
    defaults: processDefaults,
  },
  placedStudents: {
    label: "Placed students",
    description: "The two scrolling rows of learner photos.",
    icon: "Users",
    schema: placedSchema,
    fields: placedFields,
    defaults: placedDefaults,
  },
  testimonials: {
    label: "Reviews",
    description: "Three written reviews with photos and stars.",
    icon: "Star",
    schema: testimonialsSchema,
    fields: testimonialsFields,
    defaults: testimonialsDefaults,
  },
  certificate: {
    label: "Certificate",
    description: "The sample certificate and what makes it count.",
    icon: "Award",
    schema: certificateSchema,
    fields: certificateFields,
    defaults: certificateDefaults,
  },
  placementStories: {
    label: "Placement stories",
    description: "Swipeable cards of learners and where they landed.",
    icon: "BadgeCheck",
    schema: storiesSchema,
    fields: storiesFields,
    defaults: storiesDefaults,
  },
  learnerVideos: {
    label: "Video stories",
    description: "The row of portrait learner reels.",
    icon: "MonitorPlay",
    schema: videosSchema,
    fields: videosFields,
    defaults: videosDefaults,
  },
  faq: {
    label: "FAQ",
    description: "The questions admissions gets asked before anyone enrols.",
    icon: "MessagesSquare",
    schema: faqSchema,
    fields: faqFields,
    defaults: faqDefaults,
  },
  enquiry: {
    label: "Callback form",
    description: "The counselling pitch and callback form. Submissions land in Leads.",
    icon: "PhoneCall",
    schema: enquirySchema,
    fields: enquiryFields,
    defaults: enquiryDefaults,
  },
  cta: {
    label: "Closing banner",
    description: "The pink sign-up banner — shown above the footer on every public page.",
    icon: "Megaphone",
    schema: ctaSchema,
    fields: ctaFields,
    defaults: ctaDefaults,
  },
  // Appended rather than slotted in at the top: the shipped position doubles as
  // the fallback `order`, and inserting here would collide with the orders
  // already stored for the bands above.
  header: {
    label: "Header",
    description: "The bar at the top of every public page — menu, search and buttons.",
    icon: "Compass",
    schema: headerSchema,
    fields: headerFields,
    defaults: headerDefaults,
  },
  footer: {
    label: "Footer",
    description: "The foot of every public page — link columns, addresses, contact and socials.",
    icon: "Building2",
    schema: footerSchema,
    fields: footerFields,
    defaults: footerDefaults,
  },
} as const;

export type HomeSectionKey = keyof typeof HOME_SECTIONS;

/** The stored shape of one section's content. */
export type HomeData<K extends HomeSectionKey> = z.infer<(typeof HOME_SECTIONS)[K]["schema"]>;

/** Keys in their shipped order — also the fallback order for a fresh install. */
export const HOME_SECTION_KEYS = Object.keys(HOME_SECTIONS) as HomeSectionKey[];

export function isHomeSectionKey(value: string): value is HomeSectionKey {
  return value in HOME_SECTIONS;
}

/**
 * Sections the marketing *layout* renders, so they appear on every public page
 * rather than in the homepage's own stack. They are edited alongside the rest —
 * they are still homepage furniture — but reordering them means nothing, and
 * switching one off hides it site-wide.
 */
export const GLOBAL_SECTION_KEYS: HomeSectionKey[] = ["header", "cta", "footer"];

export function isGlobalSection(key: HomeSectionKey): boolean {
  return GLOBAL_SECTION_KEYS.includes(key);
}

/**
 * Sections that may be edited but not switched off. A site with no header has
 * no navigation and no way back to the homepage, and one with no footer loses
 * its address, phone number and legal links — neither is a state an admin can
 * usefully choose, and both are a long way from Admin → Homepage to undo.
 */
export const ALWAYS_ON_KEYS: HomeSectionKey[] = ["header", "footer"];

export function isAlwaysOn(key: HomeSectionKey): boolean {
  return ALWAYS_ON_KEYS.includes(key);
}

/**
 * Parse stored content for a section, filling in anything missing and
 * discarding anything invalid. Content that fails outright falls back to the
 * shipped defaults, because a bad row must never take the homepage down.
 */
export function parseHomeData<K extends HomeSectionKey>(
  key: K,
  stored: unknown,
): HomeData<K> {
  const def = HOME_SECTIONS[key];
  const merged =
    stored && typeof stored === "object" && !Array.isArray(stored)
      ? { ...def.defaults, ...(stored as Record<string, unknown>) }
      : def.defaults;
  const parsed = def.schema.safeParse(merged);
  return (parsed.success ? parsed.data : def.defaults) as HomeData<K>;
}

/** Payload accepted by PATCH /api/homepage/[key]. */
export const updateHomeSectionSchema = z.object({
  enabled: z.boolean().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateHomeSectionInput = z.infer<typeof updateHomeSectionSchema>;

/** Payload accepted by PATCH /api/homepage — the full key order, top to bottom. */
export const reorderHomeSchema = z.object({
  keys: z.array(z.string().refine(isHomeSectionKey, "Unknown section")).min(1),
});
export type ReorderHomeInput = z.infer<typeof reorderHomeSchema>;
