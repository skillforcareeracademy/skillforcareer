/**
 * Google Maps links for the academy's centres.
 *
 * An admin can give a centre an explicit search — a place name or a plus-code —
 * when the postal address doesn't drop the pin in the right spot; otherwise the
 * address itself is searched, which is right often enough to be the default.
 */
export interface MappableOffice {
  label?: string;
  line1?: string;
  line2?: string;
  mapQuery?: string;
}

export function mapsHref(office: MappableOffice): string {
  const query =
    office.mapQuery?.trim() ||
    [office.line1, office.line2].filter((l) => l?.trim()).join(", ") ||
    office.label ||
    "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
