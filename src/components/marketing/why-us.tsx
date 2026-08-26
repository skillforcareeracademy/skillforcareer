"use client";

import { motion, type Variants } from "framer-motion";
import { Card } from "@/components/ui/card";
import { gradientFor, iconFor } from "@/config/icons";
import type { HomeData } from "@/lib/validations/homepage";
import { cn } from "@/lib/utils";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

export function WhyUs({ data }: { data: HomeData<"whyUs"> }) {
  if (data.items.length === 0) return null;

  return (
    <section className="container-page py-16 sm:py-24">
      <div className="mx-auto mb-12 max-w-2xl text-center">
        <h2 className="text-3xl sm:text-4xl">{data.title}</h2>
        {data.description && (
          <p className="text-muted-foreground mt-3">{data.description}</p>
        )}
      </div>

      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
      >
        {data.items.map((benefit, i) => {
          const Icon = iconFor(benefit.icon);
          return (
            <motion.div key={`${benefit.title}-${i}`} variants={item}>
              <Card className="group h-full gap-3 p-6 transition-shadow hover:shadow-lg">
                <div
                  className={cn(
                    "flex size-12 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm transition-transform group-hover:scale-105",
                    gradientFor(benefit.tint),
                  )}
                >
                  <Icon className="size-6" aria-hidden />
                </div>
                <h3 className="text-lg">{benefit.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {benefit.description}
                </p>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}
