import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require";
import { PERMISSIONS } from "@/config/roles";
import { listHolidayYears, listHolidays } from "@/server/services/holiday-service";
import { istToday } from "@/lib/ist";
import { HolidaysClient } from "@/components/admin/holidays/holidays-client";

export const metadata: Metadata = { title: "Holidays" };
export const dynamic = "force-dynamic";

export default async function HolidaysPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission(PERMISSIONS.MANAGE_BATCHES);
  const sp = await searchParams;
  const today = istToday();
  const asked = Number(typeof sp.year === "string" ? sp.year : NaN);
  const year = Number.isInteger(asked) && asked >= 2000 && asked <= 2100 ? asked : Number(today.slice(0, 4));

  const [holidays, years] = await Promise.all([listHolidays(year), listHolidayYears()]);
  return <HolidaysClient year={year} years={years} holidays={holidays} today={today} />;
}
