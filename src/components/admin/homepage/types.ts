import type { HomeSectionKey } from "@/lib/validations/homepage";

/**
 * A section as the browser handles it. The server's `HomeSection` is a
 * discriminated union so each `data` is precisely typed against its own schema;
 * the editor is generic by design and works field-by-field, so it takes the
 * loose shape instead of switching on the key.
 */
export interface EditableSection {
  key: HomeSectionKey;
  enabled: boolean;
  order: number;
  data: Record<string, unknown>;
  updatedAt: string | null;
  customised: boolean;
}
