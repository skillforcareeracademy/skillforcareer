import Link from "next/link";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";

type ButtonLinkProps = Omit<ComponentProps<typeof Button>, "render"> & {
  href: ComponentProps<typeof Link>["href"];
};

/**
 * A Button that renders as a Next.js `<Link>`.
 *
 * Base UI's Button assumes a native `<button>` (`nativeButton` defaults to
 * true); rendering an anchor without correcting that warns and drops button
 * semantics. This wrapper sets `nativeButton={false}` so link-styled buttons
 * stay accessible — use it anywhere a button should navigate.
 */
export function ButtonLink({ href, ...props }: ButtonLinkProps) {
  return <Button nativeButton={false} render={<Link href={href} />} {...props} />;
}
