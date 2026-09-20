import { prisma } from "@/lib/prisma";
import {
  LEAD_STAT_CARDS,
  DEFAULT_LEAD_STAT_CARDS,
  type LeadStatCard,
} from "@/lib/validations/lead";

/**
 * Which stat cards each counsellor keeps above the lead list, stored under
 * `User.preferences.leadCards` beside the notification toggles.
 */

/** The saved choice in catalogue order, or the defaults if never chosen. */
export async function getLeadCards(userId: string): Promise<LeadStatCard[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferences: true },
  });
  const prefs = user?.preferences;
  const stored =
    prefs && typeof prefs === "object" && !Array.isArray(prefs)
      ? (prefs as Record<string, unknown>).leadCards
      : undefined;
  if (!Array.isArray(stored)) return [...DEFAULT_LEAD_STAT_CARDS];
  // Unknown keys (a card since retired) drop out rather than render blank.
  return LEAD_STAT_CARDS.filter((card) => stored.includes(card));
}

/**
 * Save the choice. Raw SQL, not `prisma.user.update()`: under
 * `relationMode = "prisma"` that SELECTs from every table referencing `User`
 * before it writes (see `auth-service.touchLogin`). `JSON_SET` swaps just this
 * one key, so a notification toggle saved at the same moment is not lost.
 */
export async function saveLeadCards(
  userId: string,
  cards: LeadStatCard[],
): Promise<LeadStatCard[]> {
  const chosen = LEAD_STAT_CARDS.filter((card) => cards.includes(card));
  const json = JSON.stringify(chosen);
  await prisma.$executeRaw`
    UPDATE \`User\`
       SET preferences = JSON_SET(
             CASE WHEN JSON_TYPE(preferences) = 'OBJECT' THEN preferences ELSE JSON_OBJECT() END,
             '$.leadCards',
             CAST(${json} AS JSON)
           ),
           updatedAt = NOW(3)
     WHERE id = ${userId}
  `;
  return chosen;
}
