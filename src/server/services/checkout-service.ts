import { prisma } from "@/lib/prisma";

/**
 * The express checkout at `/checkout/[slug]`.
 *
 * The client's complaint was that "Sign in to enroll" bounced a buyer to the
 * login page and then dropped them on their dashboard, money never asked for.
 * This page is the answer: one screen with the course, the price and a pay
 * button, where the account is made out of the billing details rather than in
 * a separate signup step beforehand.
 */

export interface CheckoutCourse {
  id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  thumbnailUrl: string | null;
  level: string;
  categoryName: string | null;
  instructorName: string;
  price: number;
  discountPrice: number | null;
  /** What the buyer actually pays before any coupon. */
  effectivePrice: number;
  pricingType: string;
  isFree: boolean;
  lessons: number;
  durationMinutes: number;
}

/** Course + pricing for the checkout screen, or null when it isn't buyable. */
export async function getCheckoutCourse(slug: string): Promise<CheckoutCourse | null> {
  const c = await prisma.course.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: {
      id: true,
      title: true,
      slug: true,
      subtitle: true,
      thumbnailUrl: true,
      level: true,
      price: true,
      discountPrice: true,
      pricingType: true,
      durationMinutes: true,
      category: { select: { name: true } },
      instructor: { select: { name: true } },
    },
  });
  if (!c) return null;

  // One count rather than pulling the curriculum in — the page only prints
  // the number, and a nested include is a round-trip per level here.
  const lessons = await prisma.lesson.count({ where: { chapter: { courseId: c.id } } });

  const price = Number(c.price);
  const discountPrice = c.discountPrice == null ? null : Number(c.discountPrice);
  const effectivePrice = discountPrice ?? price;

  return {
    id: c.id,
    title: c.title,
    slug: c.slug,
    subtitle: c.subtitle,
    thumbnailUrl: c.thumbnailUrl,
    level: c.level,
    categoryName: c.category?.name ?? null,
    instructorName: c.instructor?.name ?? "SkillForCareer",
    price,
    discountPrice,
    effectivePrice,
    pricingType: c.pricingType,
    isFree: c.pricingType === "FREE" || effectivePrice <= 0,
    lessons,
    durationMinutes: c.durationMinutes,
  };
}
