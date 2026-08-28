import { z } from "zod";
import { ICON_NAMES } from "@/config/icons";
import { siteConfig } from "@/config/site";
import type { AnyField } from "./homepage";

/**
 * The secondary pages as editable content.
 *
 * Same idea as `validations/homepage`, and deliberately the same machinery — a
 * Zod schema, the shipped defaults, and a field spec that draws the admin form —
 * so Admin → Pages needed no bespoke code per band. The client asked for
 * "dynamic sections in admin for About us, Contact, business, live classes
 * page"; this is the list of what those sections are.
 *
 * Client-safe: the admin editor imports it in the browser, so nothing here may
 * reach for the database.
 */

// ── Zod helpers (mirrors of the homepage ones) ───────────────────────────────

const text = (max = 160) => z.string().trim().max(max).default("");
const link = (max = 500) => z.string().trim().max(max).default("");
const icon = (fallback: string) =>
  z.enum(ICON_NAMES as [string, ...string[]]).catch(fallback as never);

/** A heading + body card, the shape most of these pages are built from. */
const featureItem = z.object({
  icon: icon("Sparkles"),
  title: text(80),
  body: text(400),
});
const featureFields: AnyField[] = [
  { name: "icon", label: "Icon", type: "icon" },
  { name: "title", label: "Title", type: "text" },
  { name: "body", label: "Body", type: "textarea", wide: true },
];

const faqItem = z.object({ q: text(200), a: text(1200) });
const faqFields: AnyField[] = [
  { name: "q", label: "Question", type: "text", wide: true },
  { name: "a", label: "Answer", type: "textarea", wide: true },
];

// ── Shared: contact details and centres ──────────────────────────────────────

/**
 * The academy's addresses, in one place.
 *
 * They used to live in three: the footer's own editor, and hardcoded copies on
 * the About and Contact pages read from `config/site`. The client changed the
 * footer, saw the About page still showing the old Noida address, and reasonably
 * called it broken. One section now feeds all three.
 */
const officesSchema = z.object({
  title: text(80),
  description: text(300),
  offices: z
    .array(
      z.object({
        label: text(80),
        line1: text(200),
        line2: text(200),
        /** What "Open in Google Maps" searches for; blank uses the address. */
        mapQuery: text(240),
      }),
    )
    .max(8)
    .default([]),
  footnote: text(240),
});

const officesFields: AnyField[] = [
  { name: "title", label: "Heading", type: "text" },
  { name: "description", label: "Sub-heading", type: "textarea", wide: true },
  {
    name: "offices",
    label: "Centres",
    type: "list",
    itemLabel: "centre",
    titleKey: "label",
    max: 8,
    hint: "Shown on About us, Contact and in the footer of every page — edited once, here.",
    fields: [
      { name: "label", label: "Name", type: "text", placeholder: "Dehradun" },
      { name: "line1", label: "Address line 1", type: "text", wide: true },
      { name: "line2", label: "Address line 2", type: "text", wide: true },
      {
        name: "mapQuery",
        label: "Google Maps search",
        type: "text",
        wide: true,
        hint: "Leave blank to search for the address above. Paste a place name or plus-code for an exact pin.",
      },
    ],
  },
  { name: "footnote", label: "Small print under the cards", type: "text", wide: true },
];

const officesDefaults: z.infer<typeof officesSchema> = {
  title: "Where to find us",
  description:
    "Our centres for offline and hybrid batches — and live classes everywhere else.",
  offices: siteConfig.contact.offices.map((o) => ({
    label: o.label,
    line1: o.line1,
    line2: o.line2,
    mapQuery: "",
  })),
  footnote: "Skill For Career is a brand of Webeside Technology · GST 06CEWPB0138N1Z8",
};

// ── About: hero ──────────────────────────────────────────────────────────────

const aboutHeroSchema = z.object({
  badge: text(60),
  titleLead: text(80),
  titleHighlight: text(80),
  subtitle: text(500),
  primaryLabel: text(40),
  primaryHref: link(300),
  secondaryLabel: text(40),
  secondaryHref: link(300),
});

const aboutHeroFields: AnyField[] = [
  { name: "badge", label: "Badge above the heading", type: "text" },
  { name: "titleLead", label: "Heading — first part", type: "text" },
  {
    name: "titleHighlight",
    label: "Heading — highlighted part",
    type: "text",
    hint: "Drawn in the brand gradient.",
  },
  { name: "subtitle", label: "Intro paragraph", type: "textarea", wide: true },
  { name: "primaryLabel", label: "Main button text", type: "text" },
  { name: "primaryHref", label: "Main button links to", type: "text" },
  { name: "secondaryLabel", label: "Second button text", type: "text" },
  { name: "secondaryHref", label: "Second button links to", type: "text" },
];

const aboutHeroDefaults: z.infer<typeof aboutHeroSchema> = {
  badge: "About us",
  titleLead: "Quality skill training,",
  titleHighlight: "and the job at the end of it",
  subtitle:
    "Skill For Career Academy empowers learners with practical, job-ready skills through IIT-qualified instructors, hands-on training and a modern learning platform — online, offline and hybrid.",
  primaryLabel: "Explore courses",
  primaryHref: "/courses",
  secondaryLabel: "Talk to a counsellor",
  secondaryHref: "/contact",
};

// ── About: mission ───────────────────────────────────────────────────────────

const aboutMissionSchema = z.object({
  badge: text(60),
  title: text(120),
  paragraphs: z.array(z.object({ text: text(900) })).max(4).default([]),
  audience: z.array(z.object({ text: text(120) })).max(8).default([]),
  imageUrl: link(),
  imageAlt: text(120),
  statValue: text(20),
  statLabel: text(120),
});

const aboutMissionFields: AnyField[] = [
  { name: "badge", label: "Badge", type: "text" },
  { name: "title", label: "Heading", type: "text" },
  {
    name: "paragraphs",
    label: "Body",
    type: "list",
    itemLabel: "paragraph",
    titleKey: "text",
    max: 4,
    fields: [{ name: "text", label: "Paragraph", type: "textarea", wide: true }],
  },
  {
    name: "audience",
    label: "Who we serve",
    type: "list",
    itemLabel: "line",
    titleKey: "text",
    max: 8,
    hint: "The ticked list beside the photo.",
    fields: [{ name: "text", label: "Line", type: "text", wide: true }],
  },
  {
    name: "imageUrl",
    label: "Photo",
    type: "image",
    wide: true,
    hint: "Upload one, pick from the Media library, or paste a path.",
  },
  { name: "imageAlt", label: "Photo description", type: "text", wide: true },
  { name: "statValue", label: "Floating card — number", type: "text" },
  { name: "statLabel", label: "Floating card — caption", type: "text" },
];

const aboutMissionDefaults: z.infer<typeof aboutMissionSchema> = {
  badge: "Our mission",
  title: "Practicality, meet innovation",
  paragraphs: [
    {
      text: "We exist to do two things well: teach a skill properly, and help the learner land the job it unlocks. Everything else — the curriculum, the batch timings, the platform — is built backwards from that.",
    },
    {
      text: "Skill For Career Academy is an online and offline learning platform with IIT-based educators, an updated curriculum, flexible timings, hybrid classes and a dedicated LMS carrying notes, class recordings and resources. That combination is what prepares students, job seekers and working professionals for real corporate opportunities.",
    },
  ],
  audience: [
    { text: "Students looking for their first job" },
    { text: "Job seekers switching into tech and data roles" },
    { text: "Working professionals upgrading their skills" },
    { text: "Companies training whole teams" },
  ],
  imageUrl: "/images/students/student-19.png",
  imageAlt: "A Skill For Career learner",
  statValue: "900+",
  statLabel: "learners placed after training with us",
};

// ── About: founders ──────────────────────────────────────────────────────────

const aboutFoundersSchema = z.object({
  badge: text(60),
  title: text(120),
  description: text(400),
  people: z
    .array(
      z.object({
        name: text(80),
        role: text(80),
        photoUrl: link(),
        bio: text(800),
        linkedin: link(300),
      }),
    )
    .max(6)
    .default([]),
});

const aboutFoundersFields: AnyField[] = [
  { name: "badge", label: "Badge", type: "text" },
  { name: "title", label: "Heading", type: "text" },
  { name: "description", label: "Sub-heading", type: "textarea", wide: true },
  {
    name: "people",
    label: "People",
    type: "list",
    itemLabel: "person",
    titleKey: "name",
    max: 6,
    hint: "Founders, directors and anyone else the page should introduce.",
    fields: [
      { name: "name", label: "Name", type: "text" },
      { name: "role", label: "Role", type: "text", placeholder: "Founder & Director" },
      { name: "photoUrl", label: "Photo", type: "image", wide: true },
      { name: "bio", label: "About them", type: "textarea", wide: true },
      {
        name: "linkedin",
        label: "LinkedIn",
        type: "text",
        wide: true,
        hint: "Optional. Leave blank to drop the link.",
      },
    ],
  },
];

const aboutFoundersDefaults: z.infer<typeof aboutFoundersSchema> = {
  badge: "Leadership",
  title: "The people behind the academy",
  description:
    "Skill For Career Academy is run by practitioners who teach, and who answer for the outcome.",
  people: [],
};

// ── About: values ────────────────────────────────────────────────────────────

const aboutValuesSchema = z.object({
  title: text(120),
  description: text(400),
  items: z.array(featureItem).max(9).default([]),
});

const aboutValuesFields: AnyField[] = [
  { name: "title", label: "Heading", type: "text" },
  { name: "description", label: "Sub-heading", type: "textarea", wide: true },
  {
    name: "items",
    label: "Cards",
    type: "list",
    itemLabel: "card",
    titleKey: "title",
    max: 9,
    fields: featureFields,
  },
];

const aboutValuesDefaults: z.infer<typeof aboutValuesSchema> = {
  title: "What makes us stand out",
  description:
    "Industry-relevant learning that helps students and professionals grow confidently in their careers.",
  items: [
    {
      icon: "GraduationCap",
      title: "Taught by practitioners",
      body: "IIT-qualified educators and working professionals who teach the way the job actually works.",
    },
    {
      icon: "BookOpenCheck",
      title: "Practical over theoretical",
      body: "Hands-on training built around projects, case studies and the tools employers hire for.",
    },
    {
      icon: "MonitorPlay",
      title: "A real learning platform",
      body: "Notes, class recordings and resources in one dashboard — not a folder of shared links.",
    },
    {
      icon: "CalendarClock",
      title: "Learn on your schedule",
      body: "Online, offline and hybrid batches with flexible timings for students and working professionals.",
    },
    {
      icon: "Target",
      title: "Placement is the point",
      body: "Career guidance, interview preparation and placement support until the offer letter arrives.",
    },
    {
      icon: "Heart",
      title: "Free counselling, always",
      body: "Free career guidance, course guidance and notes — before you pay us anything.",
    },
  ],
};

// ── Contact: hero and channels ───────────────────────────────────────────────

const contactHeroSchema = z.object({
  badge: text(60),
  titleLead: text(80),
  titleHighlight: text(80),
  subtitle: text(500),
  channels: z
    .array(
      z.object({
        icon: icon("PhoneCall"),
        label: text(60),
        value: text(120),
        href: link(300),
        note: text(160),
      }),
    )
    .max(6)
    .default([]),
});

const contactHeroFields: AnyField[] = [
  { name: "badge", label: "Badge above the heading", type: "text" },
  { name: "titleLead", label: "Heading — first part", type: "text" },
  { name: "titleHighlight", label: "Heading — highlighted part", type: "text" },
  { name: "subtitle", label: "Intro paragraph", type: "textarea", wide: true },
  {
    name: "channels",
    label: "Ways to reach us",
    type: "list",
    itemLabel: "channel",
    titleKey: "label",
    max: 6,
    hint: "The row of cards under the heading.",
    fields: [
      { name: "icon", label: "Icon", type: "icon" },
      { name: "label", label: "Heading", type: "text" },
      { name: "value", label: "The number, address or hours", type: "text", wide: true },
      {
        name: "href",
        label: "Opens",
        type: "text",
        wide: true,
        hint: "tel:+91…, mailto:…, https://wa.me/… — or blank for a card that isn't clickable.",
      },
      { name: "note", label: "Small print", type: "text", wide: true },
    ],
  },
];

const { contact } = siteConfig;

const contactHeroDefaults: z.infer<typeof contactHeroSchema> = {
  badge: "Free counselling",
  titleLead: "Talk to us before you",
  titleHighlight: "decide anything",
  subtitle:
    "Course guidance, batch timings, fees and placement support — our counsellors answer all of it, whether or not you enrol. Students, parents and working professionals are all welcome.",
  channels: [
    {
      icon: "PhoneCall",
      label: "Call us",
      value: contact.phoneDisplay,
      href: `tel:${contact.phone}`,
      note: "Fastest way to reach a counsellor",
    },
    {
      icon: "MessageCircle",
      label: "WhatsApp",
      value: contact.phoneDisplay,
      href: `https://wa.me/${contact.whatsapp}`,
      note: "Send us a message any time",
    },
    {
      icon: "Mail",
      label: "Email",
      value: contact.email,
      href: `mailto:${contact.email}`,
      note: "For admissions and course details",
    },
    {
      icon: "Clock",
      label: "Office hours",
      value: contact.hours,
      href: "",
      note: "Walk in for free counselling",
    },
  ],
};

// ── For business ─────────────────────────────────────────────────────────────

const businessHeroSchema = z.object({
  badge: text(60),
  titleLead: text(80),
  titleHighlight: text(80),
  subtitle: text(500),
  highlights: z.array(z.object({ text: text(120) })).max(6).default([]),
});

const businessHeroFields: AnyField[] = [
  { name: "badge", label: "Badge above the heading", type: "text" },
  { name: "titleLead", label: "Heading — first part", type: "text" },
  { name: "titleHighlight", label: "Heading — highlighted part", type: "text" },
  { name: "subtitle", label: "Intro paragraph", type: "textarea", wide: true },
  {
    name: "highlights",
    label: "Ticked list",
    type: "list",
    itemLabel: "line",
    titleKey: "text",
    max: 6,
    fields: [{ name: "text", label: "Line", type: "text", wide: true }],
  },
];

const businessHeroDefaults: z.infer<typeof businessHeroSchema> = {
  badge: "Corporate training",
  titleLead: "Upskill your team,",
  titleHighlight: "measurably",
  subtitle:
    "Role-based learning paths, live cohorts taught by working practitioners, and a dashboard that tells you who actually finished — built on the same platform 1,000+ learners already use.",
  highlights: [
    { text: "Custom learning paths per role" },
    { text: "Live cohorts for your team" },
    { text: "Progress & completion dashboards" },
  ],
};

const businessOfferingsSchema = z.object({
  title: text(120),
  description: text(400),
  items: z.array(featureItem).max(9).default([]),
});

const businessOfferingsFields: AnyField[] = [
  { name: "title", label: "Heading", type: "text" },
  { name: "description", label: "Sub-heading", type: "textarea", wide: true },
  {
    name: "items",
    label: "Cards",
    type: "list",
    itemLabel: "card",
    titleKey: "title",
    max: 9,
    fields: featureFields,
  },
];

const businessOfferingsDefaults: z.infer<typeof businessOfferingsSchema> = {
  title: "What your team gets",
  description:
    "Everything on the learner side, plus the reporting and admin a company needs.",
  items: [
    {
      icon: "Layers",
      title: "Learning paths per role",
      body: "We map the catalogue to the roles on your team, so an analyst and a developer don't sit through the same syllabus.",
    },
    {
      icon: "Radio",
      title: "Private live cohorts",
      body: "Instructor-led batches scheduled around your working hours, taught only to your team.",
    },
    {
      icon: "BarChart3",
      title: "Manager dashboards",
      body: "Track enrolment, attendance, assessment scores and completion across the whole team.",
    },
    {
      icon: "ShieldCheck",
      title: "Verifiable certificates",
      body: "Every completion issues a certificate with a public verification code your HR team can check.",
    },
    {
      icon: "Headset",
      title: "A named success manager",
      body: "One point of contact for onboarding, scheduling, reporting and escalations.",
    },
    {
      icon: "FileText",
      title: "Simple billing",
      body: "Consolidated GST invoicing, annual or per-seat plans, and purchase orders where you need them.",
    },
  ],
};

const businessFaqSchema = z.object({
  title: text(120),
  items: z.array(faqItem).max(12).default([]),
});

const businessFaqFields: AnyField[] = [
  { name: "title", label: "Heading", type: "text", wide: true },
  {
    name: "items",
    label: "Questions",
    type: "list",
    itemLabel: "question",
    titleKey: "q",
    max: 12,
    fields: faqFields,
  },
];

const businessFaqDefaults: z.infer<typeof businessFaqSchema> = {
  title: "Questions teams ask us",
  items: [
    {
      q: "What is the minimum team size?",
      a: "There is no hard minimum — smaller teams typically join scheduled public cohorts, while a private batch usually makes sense from about ten learners upwards.",
    },
    {
      q: "Can you train on our own tools and processes?",
      a: "Yes. Alongside the catalogue we can fold in your internal tooling, coding standards or case studies so the training maps to the work your team actually does.",
    },
    {
      q: "Do you run sessions on-site?",
      a: "We run live online cohorts by default, and offline or hybrid sessions in and around our centres. Tell us what you need and we will quote it.",
    },
    {
      q: "How is progress reported?",
      a: "Managers get a dashboard covering enrolment, attendance, assessment scores and completion, plus a monthly summary from your success manager.",
    },
  ],
};

/**
 * The band that closes the For Business page.
 *
 * The client's report was "business page pr do CTA ek sath hain" — two calls to
 * action stacked on top of each other. They were: this one, and the site-wide
 * closing banner the marketing layout adds to every public page. Keeping this
 * one and suppressing the global band there keeps the B2B message ("request a
 * proposal") instead of the learner one ("create a free account").
 */
const businessCtaSchema = z.object({
  badge: text(60),
  title: text(120),
  body: text(400),
  primaryLabel: text(40),
  primaryHref: link(300),
  showPhone: z.boolean().default(true),
});

const businessCtaFields: AnyField[] = [
  { name: "badge", label: "Badge", type: "text" },
  { name: "title", label: "Heading", type: "text" },
  { name: "body", label: "Body", type: "textarea", wide: true },
  { name: "primaryLabel", label: "Button text", type: "text" },
  { name: "primaryHref", label: "Button links to", type: "text" },
  {
    name: "showPhone",
    label: "Show the phone number beside the button",
    type: "switch",
    hint: "The number itself comes from Pages → Contact.",
  },
];

const businessCtaDefaults: z.infer<typeof businessCtaSchema> = {
  badge: "Teams of 5 to 500",
  title: "Let's build your team's learning plan",
  body: "Send us the roles and the gap. You get a curriculum, a schedule and a price — no obligation.",
  primaryLabel: "Request a proposal",
  primaryHref: "#proposal",
  showPhone: true,
};

// ── Live classes ─────────────────────────────────────────────────────────────

const liveHeroSchema = z.object({
  badge: text(60),
  titleLead: text(80),
  titleHighlight: text(80),
  subtitle: text(500),
});

const liveHeroFields: AnyField[] = [
  { name: "badge", label: "Badge above the heading", type: "text" },
  { name: "titleLead", label: "Heading — first part", type: "text" },
  { name: "titleHighlight", label: "Heading — highlighted part", type: "text" },
  { name: "subtitle", label: "Intro paragraph", type: "textarea", wide: true },
];

const liveHeroDefaults: z.infer<typeof liveHeroSchema> = {
  badge: "Live & instructor-led",
  titleLead: "Learn live, ask questions,",
  titleHighlight: "get unstuck",
  subtitle:
    "Scheduled classes with a real instructor and a small batch of peers — every session recorded, every doubt answered, every assignment reviewed.",
};

const liveFeaturesSchema = z.object({
  title: text(120),
  description: text(400),
  items: z.array(featureItem).max(9).default([]),
});

const liveFeaturesFields: AnyField[] = [
  { name: "title", label: "Heading", type: "text" },
  { name: "description", label: "Sub-heading", type: "textarea", wide: true },
  {
    name: "items",
    label: "Cards",
    type: "list",
    itemLabel: "card",
    titleKey: "title",
    max: 9,
    fields: featureFields,
  },
];

const liveFeaturesDefaults: z.infer<typeof liveFeaturesSchema> = {
  title: "What a live class actually gives you",
  description: "Everything a classroom does, minus the commute.",
  items: [
    {
      icon: "Video",
      title: "Face-to-face teaching",
      body: "Two-way video with the instructor — not a webinar you watch in silence.",
    },
    {
      icon: "Hand",
      title: "Ask as you go",
      body: "Raise a hand mid-class and get your doubt cleared before the topic moves on.",
    },
    {
      icon: "ScreenShare",
      title: "Live code & screen share",
      body: "Watch the work happen step by step, then build it alongside the class.",
    },
    {
      icon: "MonitorPlay",
      title: "Recordings on tap",
      body: "Missed a session? The recording lands in your dashboard with the notes.",
    },
    {
      icon: "ClipboardCheck",
      title: "Graded practice",
      body: "Assignments and quizzes after each module, reviewed with real feedback.",
    },
    {
      icon: "MessageSquare",
      title: "Between-class support",
      body: "A discussion board per batch, so questions don't wait for the next session.",
    },
  ],
};

const liveFaqSchema = z.object({
  title: text(120),
  items: z.array(faqItem).max(12).default([]),
});

const liveFaqFields: AnyField[] = [
  { name: "title", label: "Heading", type: "text", wide: true },
  {
    name: "items",
    label: "Questions",
    type: "list",
    itemLabel: "question",
    titleKey: "q",
    max: 12,
    fields: faqFields,
  },
];

const liveFaqDefaults: z.infer<typeof liveFaqSchema> = {
  title: "Common questions",
  items: [
    {
      q: "What if I miss a live class?",
      a: "Every session is recorded and published to your dashboard, usually within a few hours. You keep access for the length of your enrolment, so you can catch up and still attend the next class with the batch.",
    },
    {
      q: "How big is a batch?",
      a: "Batches are kept small enough that the instructor can take questions from everyone. Each cohort lists its remaining seats below, and enrolment closes once it fills.",
    },
    {
      q: "Do I need any special software?",
      a: "No. Classes run inside the browser — a laptop or desktop with a stable connection, a mic and (optionally) a webcam is enough.",
    },
    {
      q: "Can I switch to another batch?",
      a: "Yes. If your schedule changes, talk to your counsellor and we will move you to the next suitable cohort of the same course.",
    },
    {
      q: "Are live classes more expensive than self-paced?",
      a: "Pricing is per course and is shown on the course page. Live cohorts include mentor time and doubt-clearing sessions, which self-paced access does not.",
    },
  ],
};

// ── The registry ─────────────────────────────────────────────────────────────

/** Which page a section belongs to, and where that page lives. */
export const PAGE_GROUPS = [
  { id: "about", label: "About us", href: "/about" },
  { id: "contact", label: "Contact", href: "/contact" },
  { id: "business", label: "For business", href: "/for-business" },
  { id: "live", label: "Live classes", href: "/live-classes" },
] as const;

export type PageGroupId = (typeof PAGE_GROUPS)[number]["id"];

export const PAGE_SECTIONS = {
  "about.hero": {
    group: "about",
    label: "Hero",
    description: "The heading, intro and two buttons at the top of About us.",
    icon: "Sparkles",
    alwaysOn: true,
    schema: aboutHeroSchema,
    fields: aboutHeroFields,
    defaults: aboutHeroDefaults,
  },
  "about.mission": {
    group: "about",
    label: "Our mission",
    description: "The story, the audience list and the photo beside them.",
    icon: "Target",
    alwaysOn: false,
    schema: aboutMissionSchema,
    fields: aboutMissionFields,
    defaults: aboutMissionDefaults,
  },
  "about.founders": {
    group: "about",
    label: "Founders",
    description: "Who runs the academy — name, role, photo and a short bio each.",
    icon: "UsersRound",
    alwaysOn: false,
    schema: aboutFoundersSchema,
    fields: aboutFoundersFields,
    defaults: aboutFoundersDefaults,
  },
  "about.values": {
    group: "about",
    label: "What makes us stand out",
    description: "The grid of value cards.",
    icon: "Award",
    alwaysOn: false,
    schema: aboutValuesSchema,
    fields: aboutValuesFields,
    defaults: aboutValuesDefaults,
  },
  "contact.hero": {
    group: "contact",
    label: "Hero & contact cards",
    description: "The heading and the row of call / WhatsApp / email cards.",
    icon: "PhoneCall",
    alwaysOn: true,
    schema: contactHeroSchema,
    fields: contactHeroFields,
    defaults: contactHeroDefaults,
  },
  "contact.offices": {
    group: "contact",
    label: "Centres & addresses",
    description:
      "Every address the site shows — on About us, on Contact, and in the footer.",
    icon: "MapPin",
    alwaysOn: true,
    schema: officesSchema,
    fields: officesFields,
    defaults: officesDefaults,
  },
  "business.hero": {
    group: "business",
    label: "Hero",
    description: "The heading, intro and ticked list at the top of For business.",
    icon: "Briefcase",
    alwaysOn: true,
    schema: businessHeroSchema,
    fields: businessHeroFields,
    defaults: businessHeroDefaults,
  },
  "business.offerings": {
    group: "business",
    label: "What we offer",
    description: "The grid of corporate-training cards.",
    icon: "Layers",
    alwaysOn: false,
    schema: businessOfferingsSchema,
    fields: businessOfferingsFields,
    defaults: businessOfferingsDefaults,
  },
  "business.faq": {
    group: "business",
    label: "FAQ",
    description: "Questions teams ask before they buy.",
    icon: "MessageSquare",
    alwaysOn: false,
    schema: businessFaqSchema,
    fields: businessFaqFields,
    defaults: businessFaqDefaults,
  },
  "business.cta": {
    group: "business",
    label: "Closing banner",
    description:
      "The pink banner that ends For business. This page uses this one instead of the site-wide banner, so there is only ever one.",
    icon: "Megaphone",
    alwaysOn: false,
    schema: businessCtaSchema,
    fields: businessCtaFields,
    defaults: businessCtaDefaults,
  },
  "live.hero": {
    group: "live",
    label: "Hero",
    description: "The heading and intro at the top of Live classes.",
    icon: "Radio",
    alwaysOn: true,
    schema: liveHeroSchema,
    fields: liveHeroFields,
    defaults: liveHeroDefaults,
  },
  "live.features": {
    group: "live",
    label: "Why live",
    description: "The grid of cards explaining what a live class gives you.",
    icon: "Video",
    alwaysOn: false,
    schema: liveFeaturesSchema,
    fields: liveFeaturesFields,
    defaults: liveFeaturesDefaults,
  },
  "live.faq": {
    group: "live",
    label: "FAQ",
    description: "Questions learners ask about live batches.",
    icon: "MessageSquare",
    alwaysOn: false,
    schema: liveFaqSchema,
    fields: liveFaqFields,
    defaults: liveFaqDefaults,
  },
} as const;

export type PageSectionKey = keyof typeof PAGE_SECTIONS;

/** The stored shape of one page section's content. */
export type PageData<K extends PageSectionKey> = z.infer<
  (typeof PAGE_SECTIONS)[K]["schema"]
>;

export const PAGE_SECTION_KEYS = Object.keys(PAGE_SECTIONS) as PageSectionKey[];

export function isPageSectionKey(value: string): value is PageSectionKey {
  return value in PAGE_SECTIONS;
}

/** Sections that may be edited but not switched off — a page needs its heading. */
export function isPageSectionAlwaysOn(key: PageSectionKey): boolean {
  return PAGE_SECTIONS[key].alwaysOn;
}

/** Payload accepted by PATCH /api/pages/[key]. */
export const updatePageSectionSchema = z.object({
  enabled: z.boolean().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});
