import Link from "next/link";
import {
  Award,
  CalendarCheck,
  CalendarClock,
  ClipboardList,
  CreditCard,
  FileQuestion,
  FileText,
  ListChecks,
  MessagesSquare,
  PartyPopper,
  PlayCircle,
  StickyNote,
  Video,
  Wallet,
} from "lucide-react";

/**
 * The course hub beneath the report card — every part of a learner's course,
 * one tap away ("yahin se sab tabs ke page pr jaa ske student"). Screen-only:
 * it is navigation, so it drops out of the printed report.
 */
const TILES = [
  {
    title: "Curriculum",
    href: "/student/curriculum",
    icon: ListChecks,
    desc: "Your course plan, module by module.",
  },
  {
    title: "Lectures",
    href: "/student/learning",
    icon: PlayCircle,
    desc: "Watch and pick up where you left off.",
  },
  {
    title: "Study Material",
    href: "/student/materials",
    icon: FileText,
    desc: "Notes, PDFs and resources.",
  },
  {
    title: "Quizzes",
    href: "/student/quizzes",
    icon: FileQuestion,
    desc: "Test yourself and see your scores.",
  },
  {
    title: "Assignments",
    href: "/student/assignments",
    icon: ClipboardList,
    desc: "Submit work and get feedback.",
  },
  {
    title: "Notes",
    href: "/student/notes",
    icon: StickyNote,
    desc: "Your saved notes and highlights.",
  },
  {
    title: "Webinar",
    href: "/student/webinars",
    icon: Video,
    desc: "Upcoming and recorded webinars.",
  },
  {
    title: "Upcoming Classes",
    href: "/student/live",
    icon: CalendarClock,
    desc: "Your live-class schedule.",
  },
  {
    title: "Attendance",
    href: "/student/attendance",
    icon: CalendarCheck,
    desc: "Your class attendance record.",
  },
  {
    title: "Discussion",
    href: "/student/discussions",
    icon: MessagesSquare,
    desc: "Ask questions and join in.",
  },
  {
    title: "Wallet",
    href: "/student/wallet",
    icon: Wallet,
    desc: "Referral earnings and vouchers.",
  },
  {
    title: "Certificates",
    href: "/student/certificates",
    icon: Award,
    desc: "Download your certificates.",
  },
  {
    title: "Fees",
    href: "/student/payments",
    icon: CreditCard,
    desc: "Payments, instalments and receipts.",
  },
  {
    title: "Holidays",
    href: "/student/holidays",
    icon: PartyPopper,
    desc: "The academy's holiday calendar.",
  },
] as const;

export function ReportCardHub() {
  return (
    <section className="space-y-4 print:hidden">
      <div>
        <h2 className="text-lg font-semibold">Go to…</h2>
        <p className="text-muted-foreground text-sm">
          Everything for your learning, one tap away.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {TILES.map((tile) => {
          const Icon = tile.icon;
          return (
            <Link
              key={tile.href}
              href={tile.href}
              className="group hover:border-primary/40 hover:bg-muted/40 flex flex-col gap-2 rounded-xl border p-4 transition-colors"
            >
              <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg transition-transform group-hover:scale-105">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="font-medium">{tile.title}</span>
              <span className="text-muted-foreground text-xs leading-relaxed">
                {tile.desc}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
