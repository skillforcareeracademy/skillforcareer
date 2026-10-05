import { iconFor } from "@/config/icons";
import { cn } from "@/lib/utils";

/**
 * Whether a stored icon value is a picture rather than a catalogue name.
 *
 * The academy asked to be able to use either — "provide me an option to ads
 * image or icon, anyone from both" — and the simplest way to offer that without
 * a second column everywhere is to let the one value hold a URL. No catalogue
 * name contains a slash or a colon, so the two can never be confused.
 */
export function isImageIcon(value: string | undefined | null): boolean {
  const v = (value ?? "").trim();
  return v.startsWith("/") || /^https?:\/\//i.test(v) || v.startsWith("data:");
}

/**
 * Draws one of the catalogue's icons by name — or the academy's own picture,
 * when a URL was saved in its place.
 *
 * A component rather than `const Icon = iconFor(name)` at each call site: the
 * name only exists as data, so the lookup has to happen at render time, and
 * doing it here means the one unavoidable indirection is written once instead
 * of in every picker, card and list row.
 */
export function IconGlyph({
  name,
  className,
}: {
  name: string | undefined;
  className?: string;
}) {
  if (isImageIcon(name)) {
    // A plain <img>: the picture can come from the media library, an upload or
    // a pasted link, and next/image would need every one of those hosts listed.
    // `object-contain` keeps a logo whole inside whatever box it is given.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={name}
        alt=""
        aria-hidden
        className={cn("object-contain", className)}
      />
    );
  }

  const Icon = iconFor(name);
  // iconFor returns an existing module-level component — it never defines one,
  // so it cannot reset state between renders. The compiler can't see that
  // through the lookup table, hence the exemption.
  // eslint-disable-next-line react-hooks/static-components
  return <Icon className={className} aria-hidden />;
}
