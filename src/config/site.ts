/** Central site metadata — used for SEO defaults, headers, and emails. */
export const siteConfig = {
  name: "SkillForCareer",
  shortName: "SFC",
  description:
    "An enterprise learning platform for pre-recorded, live, offline and hybrid courses — with assessments, certificates and analytics.",
  tagline: "Learn the skills. Build the career.",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  locale: "en_IN",
  keywords: [
    "LMS",
    "online courses",
    "live classes",
    "certificates",
    "e-learning",
    "skill development",
  ],
  supportEmail: "info@skillforcareer.com",
  /** Real business contact details (from the client's site, skillforcareer.com). */
  contact: {
    email: "info@skillforcareer.com",
    phone: "+919220403922",
    phoneDisplay: "+91 92204 03922",
    whatsapp: "919220403922",
    hours: "Mon – Sat, 9:00 AM – 7:00 PM",
    offices: [
      {
        label: "Faridabad",
        line1: "3H-47, Near DAV College, NIT-3",
        line2: "Faridabad, Haryana 121001",
      },
      {
        label: "Greater Noida",
        line1: "3rd Floor, Galaxy Blue Plaza, Sector 4",
        line2: "Greater Noida, Uttar Pradesh",
      },
    ],
    social: {
      facebook:
        "https://www.facebook.com/people/Skill-For-Career/61576154697846/",
      instagram: "https://www.instagram.com/skillforcareer/",
      linkedin: "https://www.linkedin.com/company/skill-for-career/",
      youtube: "https://www.youtube.com/@skill_for_career",
      x: "https://x.com/Skillforcareeer",
    },
  },
  themeColor: {
    light: "#ffffff",
    dark: "#0a0a0a",
  },
} as const;

export type SiteConfig = typeof siteConfig;
