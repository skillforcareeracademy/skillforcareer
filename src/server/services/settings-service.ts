import { prisma } from "@/lib/prisma";
import { invalidateBranding } from "./branding-service";
import {
  DEFAULT_SETTINGS,
  settingsSchema,
  type Settings,
  type UpdateSettingsInput,
} from "@/lib/validations/settings";

const GLOBAL_ID = "global";

export interface SettingsWithMeta {
  settings: Settings;
  updatedAt: string | null;
}

/** The current platform settings, with every default filled in. */
export async function getSettings(): Promise<SettingsWithMeta> {
  const row = await prisma.setting.findUnique({ where: { id: GLOBAL_ID } });
  const stored = (row?.data ?? {}) as Record<string, unknown>;

  // Defaults first, stored values on top, then validate/coerce. If a stored
  // value is somehow invalid we fall back to the default for that field.
  const parsed = settingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...stored });
  const settings = parsed.success ? parsed.data : DEFAULT_SETTINGS;

  return {
    settings,
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
  };
}

/** Merge a partial update over the current settings and persist. */
export async function updateSettings(
  input: UpdateSettingsInput,
  updatedById: string,
): Promise<SettingsWithMeta> {
  const { settings: current } = await getSettings();
  const merged = settingsSchema.parse({ ...current, ...input });

  const row = await prisma.setting.upsert({
    where: { id: GLOBAL_ID },
    create: { id: GLOBAL_ID, data: merged, updatedById },
    update: { data: merged, updatedById },
  });

  // Branding lives in this same row and is memoised for reads — drop it so a
  // logo or site-name change is visible on the very next request.
  invalidateBranding();

  return { settings: merged, updatedAt: row.updatedAt.toISOString() };
}
