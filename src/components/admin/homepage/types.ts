import type { AnyField, HomeSectionKey } from "@/lib/validations/homepage";

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

/**
 * The same, with the key left open. Admin → Pages keeps its content in its own
 * table under its own keys, but draws exactly the same form from exactly the
 * same field specs.
 */
export interface EditableRecord {
  key: string;
  enabled: boolean;
  order: number;
  data: Record<string, unknown>;
  updatedAt: string | null;
  customised: boolean;
}

/** What the editor needs about a section to draw it and label it. */
export interface SectionSpec {
  label: string;
  description: string;
  icon: string;
  fields: readonly AnyField[];
}
