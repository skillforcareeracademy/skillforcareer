import Link from "next/link";
import { ButtonLink } from "@/components/shared/button-link";
import { CourseSearch } from "@/components/shared/course-search";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { UserMenu } from "@/components/dashboard/user-menu";
import { getSessionUser } from "@/lib/auth/api-guard";
import { getHomeSection } from "@/server/services/homepage-service";
import { cn } from "@/lib/utils";
import { MobileNav } from "./mobile-nav";

/**
 * Public site header — auth-aware: shows the profile menu when signed in.
 *
 * Everything else about it is content: the links, the two buttons and whether
 * the search box and theme switch appear are all edited under
 * Admin → Homepage → Header. Nothing here is hardcoded, so the client can
 * reshape the top of the site without a deploy.
 */
export async function MarketingHeader() {
  // Both are per-request cached, so this costs nothing the page wasn't already
  // paying — the layout and footer share the same homepage read.
  const [user, section] = await Promise.all([getSessionUser(), getHomeSection("header")]);
  const {
    navLinks,
    showSearch,
    showThemeToggle,
    signInLabel,
    signInHref,
    ctaLabel,
    ctaHref,
  } = section.data;

  // A half-filled row in the editor shouldn't render as a link to nowhere.
  const links = navLinks.filter((l) => l.label.trim() && l.href.trim());

  return (
    <header className="border-border/60 bg-background/80 sticky top-0 z-40 border-b backdrop-blur-xl">
      <div className="container-page flex h-16 items-center gap-4">
        {links.length > 0 && (
          <MobileNav links={links} showSearch={showSearch} />
        )}

        <Logo />

        <nav className="hidden items-center gap-0.5 lg:flex">
          {links.map((item) => (
            <Link
              key={`${item.label}-${item.href}`}
              href={item.href}
              className="text-foreground/70 hover:text-foreground hover:bg-muted inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Search */}
        {showSearch && (
          <CourseSearch className="ml-auto hidden max-w-xs flex-1 md:block" />
        )}

        {/* Without the search box there is nothing to push the actions right at
            desktop widths, so the auto margin has to stay on at every size. */}
        <div className={cn("ml-auto flex items-center gap-1.5", showSearch && "md:ml-0")}>
          {showThemeToggle && <ThemeToggle />}
          {user ? (
            <UserMenu user={user} />
          ) : (
            <>
              {signInLabel.trim() && (
                <ButtonLink
                  href={signInHref || "/login"}
                  variant="ghost"
                  size="sm"
                  className="hidden sm:inline-flex"
                >
                  {signInLabel}
                </ButtonLink>
              )}
              {ctaLabel.trim() && (
                <ButtonLink href={ctaHref || "/register"} size="sm">
                  {ctaLabel}
                </ButtonLink>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
