"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Loader2, Search } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import type { CourseSuggestion } from "@/server/services/course-service";
import { cn } from "@/lib/utils";

const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;

const LEVEL_LABEL: Record<string, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  ALL_LEVELS: "All levels",
};

function priceLabel(course: CourseSuggestion): string {
  if (course.pricingType === "FREE") return "Free";
  const amount = course.discountPrice ?? course.price;
  return `₹${amount.toLocaleString("en-IN")}`;
}

/**
 * Course search box with a live suggestion dropdown — picking a suggestion goes
 * straight to that course page, and a plain Enter falls back to the catalog
 * filtered by the query. Used by both the hero and the site header, so the two
 * search boxes behave identically; `variant` only changes the chrome.
 */
export function CourseSearch({
  variant = "header",
  placeholder = "Search courses, skills…",
  className,
}: {
  variant?: "hero" | "header";
  placeholder?: string;
  className?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  // Suggestions are stored with the term they belong to, so a stale list is
  // never shown against a newer query — and "loading" falls out of the same fact.
  const [fetched, setFetched] = useState<{ term: string; items: CourseSuggestion[] }>({
    term: "",
    items: [],
  });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const term = query.trim();
  const isHero = variant === "hero";
  const showPanel = open && term.length >= MIN_CHARS;
  const settled = fetched.term === term;
  const results = settled ? fetched.items : [];
  const loading = term.length >= MIN_CHARS && !settled;

  useEffect(() => {
    if (term.length < MIN_CHARS) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .get<CourseSuggestion[]>(`/api/courses/search?q=${encodeURIComponent(term)}`)
        .then((items) => {
          if (!cancelled) setFetched({ term, items });
        })
        .catch(() => {
          if (!cancelled) setFetched({ term, items: [] });
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term]);

  // Close when the click lands anywhere outside the box.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function go(href: string) {
    setOpen(false);
    inputRef.current?.blur();
    router.push(href);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const picked = results[active];
    if (picked) return go(`/courses/${picked.slug}`);
    if (term) go(`/courses?search=${encodeURIComponent(term)}`);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    if (!showPanel) {
      setOpen(true);
      return;
    }
    if (results.length === 0) return;
    const step = e.key === "ArrowDown" ? 1 : -1;
    // -1 is the typed query itself, so the highlight cycles back through it.
    setActive((i) => {
      const next = i + step;
      if (next < -1) return results.length - 1;
      if (next >= results.length) return -1;
      return next;
    });
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <form
        onSubmit={onSubmit}
        role="search"
        className={cn(
          isHero
            ? "bg-card flex items-center gap-2 rounded-full border p-1.5 shadow-lg shadow-black/5"
            : "border-input bg-muted/50 focus-within:border-primary/50 focus-within:ring-primary/20 flex items-center gap-2 rounded-full border px-3.5 py-2 transition focus-within:ring-2",
        )}
      >
        <div className={cn("flex flex-1 items-center gap-2", isHero && "pl-3")}>
          <Search
            className={cn("text-muted-foreground shrink-0", isHero ? "size-5" : "size-4")}
            aria-hidden
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(-1);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-label="Search courses"
            autoComplete="off"
            enterKeyHint="search"
            role="combobox"
            aria-expanded={showPanel}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              active >= 0 && results[active] ? `${listId}-${active}` : undefined
            }
            className={cn(
              "placeholder:text-muted-foreground w-full bg-transparent outline-none",
              isHero ? "py-2 text-sm sm:text-base" : "text-sm",
            )}
          />
          {loading && (
            <Loader2 className="text-muted-foreground size-4 shrink-0 animate-spin" aria-hidden />
          )}
        </div>
        {isHero && (
          <Button type="submit" size="lg" className="rounded-full">
            Search
          </Button>
        )}
      </form>

      {showPanel && (
        <div
          className={cn(
            "bg-popover text-popover-foreground absolute z-50 mt-2 overflow-hidden rounded-2xl border shadow-xl",
            isHero ? "inset-x-0" : "right-0 left-0 min-w-[22rem]",
          )}
        >
          <ul id={listId} role="listbox" aria-label="Course suggestions" className="max-h-96 overflow-y-auto py-1">
            {results.map((course, i) => (
              <li key={course.id} role="none">
                <Link
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  href={`/courses/${course.slug}`}
                  onClick={() => setOpen(false)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                    i === active ? "bg-muted" : "hover:bg-muted",
                  )}
                >
                  <span className="bg-muted flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg">
                    {course.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={course.thumbnailUrl}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <BookOpen className="text-muted-foreground size-4" aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 text-sm font-medium">
                      {course.title}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {course.categoryName} · {LEVEL_LABEL[course.level] ?? course.level}
                    </span>
                  </span>
                  <span className="text-sm font-semibold whitespace-nowrap">
                    {priceLabel(course)}
                  </span>
                </Link>
              </li>
            ))}

            {results.length === 0 && (
              <li className="text-muted-foreground px-4 py-6 text-center text-sm">
                {loading ? "Searching…" : `No courses match “${term}”.`}
              </li>
            )}
          </ul>

          <Link
            href={`/courses?search=${encodeURIComponent(term)}`}
            onClick={() => setOpen(false)}
            className="text-primary hover:bg-muted block border-t px-4 py-2.5 text-center text-sm font-medium"
          >
            See all results for “{term}”
          </Link>
        </div>
      )}
    </div>
  );
}
