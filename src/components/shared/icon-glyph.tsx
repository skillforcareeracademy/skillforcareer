import { iconFor } from "@/config/icons";

/**
 * Draws one of the catalogue's icons by name.
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
  const Icon = iconFor(name);
  // iconFor returns an existing module-level component — it never defines one,
  // so it cannot reset state between renders. The compiler can't see that
  // through the lookup table, hence the exemption.
  // eslint-disable-next-line react-hooks/static-components
  return <Icon className={className} aria-hidden />;
}
