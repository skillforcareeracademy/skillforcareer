"use client";

import { motion, type Variants } from "framer-motion";
import {
  Radio,
  ClipboardCheck,
  Award,
  Briefcase,
  Users,
  MonitorPlay,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Benefit {
  icon: LucideIcon;
  title: string;
  description: string;
  tint: string;
}

const BENEFITS: Benefit[] = [
  {
    icon: MonitorPlay,
    title: "Learn anytime",
    description:
      "Pre-recorded, live, offline and hybrid — with resume, notes, bookmarks and playback speed.",
    tint: "from-rose-500 to-pink-600",
  },
  {
    icon: Radio,
    title: "Live interactive classes",
    description:
      "Built-in conferencing with screen share, chat, raise-hand and recording-ready sessions.",
    tint: "from-violet-500 to-purple-600",
  },
  {
    icon: ClipboardCheck,
    title: "Real assessments",
    description:
      "Timed quizzes with auto or manual grading, plus assignments with feedback and rubrics.",
    tint: "from-amber-500 to-orange-600",
  },
  {
    icon: Award,
    title: "Verifiable certificates",
    description:
      "Auto-generated certificates with a unique verification code the moment you complete a course.",
    tint: "from-emerald-500 to-teal-600",
  },
  {
    icon: Briefcase,
    title: "Career support",
    description:
      "Placement assistance, mock interviews and 500+ hiring partners to help you land the role.",
    tint: "from-sky-500 to-blue-600",
  },
  {
    icon: Users,
    title: "Mentor community",
    description:
      "1:1 mentorship, doubt-clearing and a peer community that keeps you accountable.",
    tint: "from-fuchsia-500 to-pink-600",
  },
];

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

export function WhyUs() {
  return (
    <section className="container-page py-16 sm:py-24">
      <div className="mx-auto mb-12 max-w-2xl text-center">
        <h2 className="text-3xl sm:text-4xl">Everything a modern academy needs</h2>
        <p className="text-muted-foreground mt-3">
          One platform for teaching, assessing, certifying and getting hired.
        </p>
      </div>

      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
      >
        {BENEFITS.map((b) => (
          <motion.div key={b.title} variants={item}>
            <Card className="group h-full gap-3 p-6 transition-shadow hover:shadow-lg">
              <div
                className={cn(
                  "flex size-12 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm transition-transform group-hover:scale-105",
                  b.tint,
                )}
              >
                <b.icon className="size-6" aria-hidden />
              </div>
              <h3 className="text-lg">{b.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {b.description}
              </p>
            </Card>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
