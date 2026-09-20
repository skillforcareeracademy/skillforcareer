/**
 * Indian national holidays and major festivals for 2026 and 2027.
 *
 *   npx tsx --env-file=.env scripts/seed-holidays.ts
 *
 * Idempotent — a holiday already on the same date with the same name is left
 * alone, so it is safe to run again (and it never overwrites an admin's edits).
 *
 * Where the dates come from: the Government of India (DoP&T) holiday lists for
 * Central Government offices — gazetted and restricted — for 2026 (O.M. of
 * 3 July 2025) and 2027 (O.M. of 16 July 2026). Fixed-date days and Good
 * Friday (from the Easter date) are certain.
 *
 * Festivals whose date depends on the moon being sighted (the Eids), or on
 * which panchang is followed (a few where published calendars disagree by a
 * day), carry the "[Check the date]" marker in their message. The admin page
 * shows a "Check the date" hint for them, and the morning cron holds their
 * wishes back until an admin confirms the date. They are also seeded with
 * classes running (`noClasses: false`), so an unconfirmed date never cancels a
 * class — the admin switches "No classes" on when confirming, if wanted.
 *
 * `noClasses: true` is set only on the days an Indian institute almost always
 * closes (national days, Holi, Dussehra, Diwali, Christmas). Everything else
 * sends wishes and classes go ahead; the admin can change either per holiday.
 *
 * After running this, classes already on the timetable for a no-classes day
 * are cancelled (and learners told) by the next morning's /api/cron/classes,
 * or straight away with "Rebuild timetable" on a batch.
 */
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/client";
import { getMariaDbConfig } from "../src/lib/db-config";
import { CHECK_DATE_MARKER } from "../src/lib/validations/holiday";

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0]),
});

interface SeedHoliday {
  date: string;
  name: string;
  message: string;
  noClasses: boolean;
  /** The date may be off by a day — see the header. */
  checkDate?: boolean;
}

const NEW_YEAR = "Wishing you a happy New Year! Here's to a year of learning, growth and new opportunities.";
const SANKRANTI = "Happy Makar Sankranti! May this harvest festival bring warmth, prosperity and fresh beginnings.";
const PONGAL = "Happy Pongal! May the harvest season fill your home with joy and abundance.";
const REPUBLIC = "Happy Republic Day! Let's celebrate the spirit of our Constitution and the freedom to learn and grow.";
const SHIVARATRI = "Wishing you a peaceful and blessed Maha Shivaratri.";
const HOLI = "Happy Holi! May your life be as bright and colourful as the festival itself.";
const EID_FITR = "Eid Mubarak! May this Eid bring peace, happiness and prosperity to you and your family.";
const RAM_NAVAMI = "Happy Ram Navami! Wishing you strength, wisdom and success.";
const MAHAVIR = "Warm wishes on Mahavir Jayanti. May it bring you peace and compassion.";
const GOOD_FRIDAY = "Wishing you a peaceful and reflective Good Friday.";
const BUDDHA = "Happy Buddha Purnima! May the path of wisdom and kindness light your way.";
const EID_ADHA = "Eid al-Adha Mubarak! May this festival of sacrifice bring you peace and blessings.";
const INDEPENDENCE = "Happy Independence Day! Let's honour the freedom that lets every one of us dream and build.";
const RAKHI = "Happy Raksha Bandhan! Celebrating the bond of love and protection.";
const JANMASHTAMI = "Happy Janmashtami! May Lord Krishna bless you with joy, wisdom and success.";
const GANESH = "Happy Ganesh Chaturthi! May Lord Ganesha remove every obstacle on your learning path.";
const GANDHI = "On Gandhi Jayanti, let's remember the power of truth, simplicity and lifelong learning.";
const DUSSEHRA = "Happy Dussehra! May good always triumph and every goal you set be achieved.";
const DIWALI = "Happy Diwali! May the festival of lights bring joy, prosperity and success to you and your family.";
const BHAI_DOOJ = "Happy Bhai Dooj! Celebrating the special bond between brothers and sisters.";
const GURPURAB = "Happy Guru Nanak Jayanti! May his teachings of kindness and equality guide us all.";
const CHRISTMAS = "Merry Christmas! Wishing you and your family a season full of joy and warmth.";

const HOLIDAYS: SeedHoliday[] = [
  // ── 2026 ──────────────────────────────────────────────────────────────────
  { date: "2026-01-01", name: "New Year's Day", message: NEW_YEAR, noClasses: false },
  { date: "2026-01-14", name: "Makar Sankranti / Pongal", message: SANKRANTI, noClasses: false },
  { date: "2026-01-26", name: "Republic Day", message: REPUBLIC, noClasses: true },
  { date: "2026-02-15", name: "Maha Shivaratri", message: SHIVARATRI, noClasses: false },
  { date: "2026-03-04", name: "Holi", message: HOLI, noClasses: true },
  // Moon sighting: DoP&T lists 21 Mar; it can move a day.
  { date: "2026-03-21", name: "Eid ul-Fitr", message: EID_FITR, noClasses: false, checkDate: true },
  { date: "2026-03-26", name: "Ram Navami", message: RAM_NAVAMI, noClasses: false },
  { date: "2026-03-31", name: "Mahavir Jayanti", message: MAHAVIR, noClasses: false },
  { date: "2026-04-03", name: "Good Friday", message: GOOD_FRIDAY, noClasses: false },
  { date: "2026-05-01", name: "Buddha Purnima", message: BUDDHA, noClasses: false },
  // Moon sighting: DoP&T lists 27 May; it can move a day.
  { date: "2026-05-27", name: "Eid al-Adha (Bakrid)", message: EID_ADHA, noClasses: false, checkDate: true },
  { date: "2026-08-15", name: "Independence Day", message: INDEPENDENCE, noClasses: true },
  { date: "2026-08-28", name: "Raksha Bandhan", message: RAKHI, noClasses: false },
  { date: "2026-09-04", name: "Janmashtami", message: JANMASHTAMI, noClasses: false },
  { date: "2026-09-14", name: "Ganesh Chaturthi", message: GANESH, noClasses: false },
  { date: "2026-10-02", name: "Gandhi Jayanti", message: GANDHI, noClasses: true },
  { date: "2026-10-20", name: "Dussehra", message: DUSSEHRA, noClasses: true },
  { date: "2026-11-08", name: "Diwali", message: DIWALI, noClasses: true },
  // DoP&T's restricted list has 11 Nov; several panchangs give 10 Nov.
  { date: "2026-11-11", name: "Bhai Dooj", message: BHAI_DOOJ, noClasses: false, checkDate: true },
  { date: "2026-11-24", name: "Guru Nanak Jayanti", message: GURPURAB, noClasses: false },
  { date: "2026-12-25", name: "Christmas", message: CHRISTMAS, noClasses: true },

  // ── 2027 ──────────────────────────────────────────────────────────────────
  { date: "2027-01-01", name: "New Year's Day", message: NEW_YEAR, noClasses: false },
  // DoP&T has 14 Jan; the Sun enters Makara late that evening, so many
  // calendars keep the festival on 15 Jan.
  { date: "2027-01-14", name: "Makar Sankranti", message: SANKRANTI, noClasses: false, checkDate: true },
  { date: "2027-01-15", name: "Pongal", message: PONGAL, noClasses: false },
  { date: "2027-01-26", name: "Republic Day", message: REPUBLIC, noClasses: true },
  { date: "2027-03-06", name: "Maha Shivaratri", message: SHIVARATRI, noClasses: false },
  // Moon sighting: DoP&T lists 10 Mar; it can move a day.
  { date: "2027-03-10", name: "Eid ul-Fitr", message: EID_FITR, noClasses: false, checkDate: true },
  // DoP&T has Holi on 23 Mar (Holika Dahan 22 Mar); Drik Panchang and most
  // North Indian calendars have Holi on 22 Mar. Confirm before relying on it.
  { date: "2027-03-23", name: "Holi", message: HOLI, noClasses: false, checkDate: true },
  { date: "2027-03-26", name: "Good Friday", message: GOOD_FRIDAY, noClasses: false },
  { date: "2027-04-15", name: "Ram Navami", message: RAM_NAVAMI, noClasses: false },
  { date: "2027-04-19", name: "Mahavir Jayanti", message: MAHAVIR, noClasses: false },
  // Moon sighting: DoP&T lists 17 May; it can move a day.
  { date: "2027-05-17", name: "Eid al-Adha (Bakrid)", message: EID_ADHA, noClasses: false, checkDate: true },
  { date: "2027-05-20", name: "Buddha Purnima", message: BUDDHA, noClasses: false },
  { date: "2027-08-15", name: "Independence Day", message: INDEPENDENCE, noClasses: true },
  { date: "2027-08-17", name: "Raksha Bandhan", message: RAKHI, noClasses: false },
  { date: "2027-08-25", name: "Janmashtami", message: JANMASHTAMI, noClasses: false },
  { date: "2027-09-04", name: "Ganesh Chaturthi", message: GANESH, noClasses: false },
  { date: "2027-10-02", name: "Gandhi Jayanti", message: GANDHI, noClasses: true },
  { date: "2027-10-09", name: "Dussehra", message: DUSSEHRA, noClasses: true },
  { date: "2027-10-29", name: "Diwali", message: DIWALI, noClasses: true },
  { date: "2027-10-31", name: "Bhai Dooj", message: BHAI_DOOJ, noClasses: false },
  { date: "2027-11-14", name: "Guru Nanak Jayanti", message: GURPURAB, noClasses: false },
  { date: "2027-12-25", name: "Christmas", message: CHRISTMAS, noClasses: true },
];

/** A calendar day as UTC midnight — how the `@db.Date` column stores it. */
function day(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

async function main() {
  const existing = await prisma.holiday.findMany({
    where: { date: { in: HOLIDAYS.map((h) => day(h.date)) } },
    select: { date: true, name: true },
  });
  const have = new Set(
    existing.map((e) => `${e.date.toISOString().slice(0, 10)}|${e.name.trim().toLowerCase()}`),
  );
  const fresh = HOLIDAYS.filter((h) => !have.has(`${h.date}|${h.name.trim().toLowerCase()}`));

  if (fresh.length > 0) {
    await prisma.holiday.createMany({
      data: fresh.map((h) => ({
        date: day(h.date),
        name: h.name,
        message: h.checkDate ? `${CHECK_DATE_MARKER} ${h.message}` : h.message,
        noClasses: h.noClasses,
        sendWishes: true,
      })),
    });
  }

  const flagged = fresh.filter((h) => h.checkDate);
  console.log(`Holidays: ${fresh.length} added, ${HOLIDAYS.length - fresh.length} already there.`);
  if (flagged.length) {
    console.log(`${flagged.length} need their date confirmed in Admin → Holidays:`);
    for (const h of flagged) console.log(`  ${h.date}  ${h.name}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
