import Link from "next/link";
import { Search } from "lucide-react";
import { ButtonLink } from "@/components/shared/button-link";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { UserMenu } from "@/components/dashboard/user-menu";
import { getSessionUser } from "@/lib/auth/api-guard";
import { ROUTES } from "@/lib/constants";

const NAV = [
  { label: "Courses", href: "/courses" },
  { label: "Categories", href: "/#categories" },
  { label: "Live Classes", href: ROUTES.login },
  { label: "For Business", href: ROUTES.register },
];

/** Public site header — auth-aware: shows the profile menu when signed in. */
export async function MarketingHeader() {
  const user = await getSessionUser();

  return (
    <header className="border-border/60 bg-background/80 sticky top-0 z-40 border-b backdrop-blur-xl">
      <div className="container-page flex h-16 items-center gap-4">
        <Logo />

        <nav className="hidden items-center gap-0.5 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="text-foreground/70 hover:text-foreground hover:bg-muted inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Search */}
        <div className="ml-auto hidden max-w-xs flex-1 md:block">
          <div className="border-input bg-muted/50 focus-within:border-primary/50 focus-within:ring-primary/20 flex items-center gap-2 rounded-full border px-3.5 py-2 transition focus-within:ring-2">
            <Search className="text-muted-foreground size-4 shrink-0" />
            <input
              type="search"
              placeholder="Search courses, skills…"
              aria-label="Search courses"
              className="placeholder:text-muted-foreground w-full bg-transparent text-sm outline-none"
            />
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1.5 md:ml-0">
          <ThemeToggle />
          {user ? (
            <UserMenu user={user} />
          ) : (
            <>
              <ButtonLink
                href={ROUTES.login}
                variant="ghost"
                size="sm"
                className="hidden sm:inline-flex"
              >
                Sign in
              </ButtonLink>
              <ButtonLink href={ROUTES.register} size="sm">
                Get started
              </ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
