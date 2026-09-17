import { ButtonLink } from "@/components/shared/button-link";
import { CourseSearch } from "@/components/shared/course-search";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { UserMenu } from "@/components/dashboard/user-menu";
import { getSessionUser } from "@/lib/auth/api-guard";
import { getHomeSection } from "@/server/services/homepage-service";
import { getHeaderMenus } from "@/server/services/header-menu-service";
import { cn } from "@/lib/utils";
import { EnquiryDialog } from "@/components/marketing/enquiry-dialog";
import { Button } from "@/components/ui/button";
import { MessageSquareText } from "lucide-react";
import { HeaderNav, type HeaderLink } from "./header-nav";
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
  // All three are per-request cached, so this costs nothing the page wasn't
  // already paying — the layout and footer share the same homepage read, and the
  // dropdown lists are memoised across requests.
  const [user, section, menus] = await Promise.all([
    getSessionUser(),
    getHomeSection("header"),
    getHeaderMenus(),
  ]);
  const {
    navLinks,
    showSearch,
    showThemeToggle,
    signInLabel,
    signInHref,
    ctaLabel,
    ctaHref,
    enquiryLabel,
  } = section.data;

  // A half-filled row in the editor shouldn't render as a link to nowhere.
  const links: HeaderLink[] = navLinks.filter((l) => l.label.trim() && l.href.trim());

  return (
    <header className="border-border/60 bg-background/80 sticky top-0 z-40 border-b backdrop-blur-xl">
      <div className="container-page flex h-16 items-center gap-4">
        {links.length > 0 && (
          <MobileNav links={links} menus={menus} showSearch={showSearch} />
        )}

        {/* Smaller on phones — at the full 42px the lockup crowded the row
            ("logo size chhota kro phone view me, bahut bada lag raha hai"). */}
        <Logo className="h-8 max-w-[150px] sm:h-[42px] sm:max-w-[220px]" />

        <HeaderNav links={links} menus={menus} />

        {/* Search */}
        {showSearch && (
          <CourseSearch className="ml-auto hidden max-w-xs flex-1 md:block" />
        )}

        {/* Without the search box there is nothing to push the actions right at
            desktop widths, so the auto margin has to stay on at every size. */}
        <div className={cn("ml-auto flex items-center gap-1.5", showSearch && "md:ml-0")}>
          {showThemeToggle && <ThemeToggle />}

          {/* The callback popup. Sits outside the signed-in branch on purpose —
              an existing learner enquiring about a *second* programme is the
              academy's best lead, and the course pages open this very dialog. */}
          {enquiryLabel.trim() && (
            <EnquiryDialog
              trigger={
                <Button variant="outline" size="sm" className="hidden gap-1.5 sm:inline-flex">
                  <MessageSquareText className="size-4" />
                  {enquiryLabel}
                </Button>
              }
            />
          )}

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
