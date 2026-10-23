"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Search,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A PDF rendered inside the app, on a canvas, rather than handed to the
 * browser's own viewer in a new tab — "PDF viewer is not opening properly …
 * LMS ke andar hi khulna chahiye". An iframe or <embed> pointed at a PDF simply
 * shows nothing on an iPad (iOS renders a PDF only on a full-page navigation),
 * so pdf.js draws each page itself, which works the same on a tablet, a phone
 * and a desktop.
 *
 * It is pdf.js's own viewer — the one that ships with the library — not a bare
 * canvas, so it has what a reader expects: a scrollbar, page-to-page movement
 * and a jump-to-page box, zoom, and find-in-document with the matches
 * highlighted ("isme scroller bhi nhi hai. Page search or text search bhi
 * nhi hai"). It still draws to canvas, so it works on an iPad all the same.
 *
 * The worker and the viewer stylesheet are served from our own origin
 * (public/pdf.worker.min.mjs and public/pdf_viewer.css, both pinned to the
 * installed pdfjs-dist) so nothing is fetched from a third-party origin and no
 * CSP exception is needed.
 */

/** Load the viewer stylesheet once, only when a PDF is actually opened. */
function usePdfViewerCss() {
  useEffect(() => {
    const id = "pdfjs-viewer-css";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "/pdf_viewer.css";
    document.head.appendChild(link);
  }, []);
}

type Matches = { current: number; total: number };

// The handful of pdf.js pieces we hold on to between renders. Their full types
// live in pdfjs-dist, but we only touch a small, stable surface of each.
interface ViewerApp {
  viewer: {
    currentScale: number;
    currentScaleValue: string;
    currentPageNumber: number;
    setDocument: (doc: unknown) => void;
    cleanup?: () => void;
  };
  eventBus: { dispatch: (name: string, payload: unknown) => void };
  destroy: () => void;
}

export function PdfViewer({
  url,
  name,
  maximized,
  allowNewTab = true,
}: {
  url: string;
  name?: string | null;
  maximized?: boolean;
  /** When the in-app render fails, may we offer the file in a new tab? Off for
   *  a learner whose material keeps the source link out of reach. */
  allowNewTab?: boolean;
}) {
  usePdfViewerCss();

  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<ViewerApp | null>(null);

  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [scalePct, setScalePct] = useState(100);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Matches | null>(null);

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};

    async function setup() {
      setState("loading");
      setMatches(null);
      try {
        const pdfjs = await import("pdfjs-dist");
        const { EventBus, PDFLinkService, PDFFindController, PDFViewer } =
          await import("pdfjs-dist/web/pdf_viewer.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        const container = containerRef.current;
        const viewerEl = viewerRef.current;
        if (!container || !viewerEl) return;

        const eventBus = new EventBus();
        const linkService = new PDFLinkService({ eventBus });
        const findController = new PDFFindController({ eventBus, linkService });
        // A no-op localisation, so the viewer never reaches for a locale file.
        const l10n = {
          getLanguage: () => "en-US",
          getDirection: () => "ltr",
          get: async (_id: string, _args: unknown, fallback?: string) =>
            fallback ?? "",
          translate: async () => {},
          translateOnce: () => "",
          pause: () => {},
          resume: () => {},
          destroy: () => {},
        };

        const viewer = new PDFViewer({
          container,
          viewer: viewerEl,
          eventBus,
          linkService,
          findController,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          l10n: l10n as any,
          textLayerMode: 1,
        });
        linkService.setViewer(viewer);

        eventBus.on("pagesinit", () => {
          viewer.currentScaleValue = "page-width";
          if (!cancelled) {
            setScalePct(Math.round(viewer.currentScale * 100));
            setState("ready");
          }
        });
        eventBus.on("pagechanging", (e: { pageNumber: number }) => {
          if (!cancelled) setPage(e.pageNumber);
        });
        eventBus.on("scalechanging", () => {
          if (!cancelled) setScalePct(Math.round(viewer.currentScale * 100));
        });
        eventBus.on(
          "updatefindmatchescount",
          (e: { matchesCount: Matches }) => {
            if (!cancelled) setMatches(e.matchesCount);
          },
        );
        eventBus.on(
          "updatefindcontrolstate",
          (e: { matchesCount: Matches }) => {
            if (!cancelled) setMatches(e.matchesCount ?? { current: 0, total: 0 });
          },
        );

        const task = pdfjs.getDocument({ url });
        const doc = await task.promise;
        if (cancelled) {
          void doc.destroy();
          return;
        }
        setPages(doc.numPages);
        viewer.setDocument(doc);
        linkService.setDocument(doc, null);

        appRef.current = {
          viewer: viewer as unknown as ViewerApp["viewer"],
          eventBus: eventBus as unknown as ViewerApp["eventBus"],
          destroy: () => {
            try {
              viewer.cleanup?.();
            } catch {}
            try {
              viewer.setDocument(null as never);
            } catch {}
            try {
              void doc.destroy();
            } catch {}
          },
        };
        cleanup = () => appRef.current?.destroy();
      } catch {
        if (!cancelled) setState("error");
      }
    }

    void setup();
    return () => {
      cancelled = true;
      cleanup();
      appRef.current = null;
    };
  }, [url]);

  // The dialog growing or shrinking changes how wide a page should be drawn;
  // re-fit once it has settled at its new size.
  useEffect(() => {
    const id = setTimeout(() => {
      const app = appRef.current;
      if (app) {
        try {
          app.viewer.currentScaleValue = "page-width";
        } catch {}
      }
    }, 150);
    return () => clearTimeout(id);
  }, [maximized]);

  // Keep a page fit to the width as the container itself resizes.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      const app = appRef.current;
      if (app && app.viewer.currentScaleValue === "page-width") {
        try {
          app.viewer.currentScaleValue = "page-width";
        } catch {}
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  const goTo = useCallback(
    (n: number) => {
      const app = appRef.current;
      if (!app) return;
      app.viewer.currentPageNumber = Math.min(Math.max(1, n), pages || 1);
    },
    [pages],
  );

  const zoom = useCallback((direction: 1 | -1) => {
    const app = appRef.current;
    if (!app) return;
    const next = +(app.viewer.currentScale + direction * 0.2).toFixed(2);
    app.viewer.currentScale = Math.min(4, Math.max(0.25, next));
  }, []);

  const find = useCallback(
    (again: boolean, findPrevious = false) => {
      const app = appRef.current;
      if (!app || !query.trim()) return;
      app.eventBus.dispatch("find", {
        source: null,
        type: again ? "again" : "",
        query,
        caseSensitive: false,
        entireWord: false,
        highlightAll: true,
        findPrevious,
        matchDiacritics: false,
      });
    },
    [query],
  );

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border",
        maximized ? "h-[82vh]" : "h-[70vh]",
      )}
    >
      {/* ── Reader toolbar ─────────────────────────────────────────────── */}
      <div className="bg-muted/40 flex flex-wrap items-center gap-x-3 gap-y-2 border-b p-2">
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => goTo(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            <ChevronUp className="size-4" />
          </Button>
          <input
            className="border-input bg-background h-8 w-12 rounded-md border px-2 text-center text-sm"
            value={page}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isNaN(v)) setPage(v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") goTo(page);
            }}
            inputMode="numeric"
            aria-label="Page number"
          />
          <span className="text-muted-foreground text-sm">/ {pages || "—"}</span>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => goTo(page + 1)}
            disabled={pages > 0 && page >= pages}
            aria-label="Next page"
          >
            <ChevronDown className="size-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => zoom(-1)}
            aria-label="Zoom out"
          >
            <ZoomOut className="size-4" />
          </Button>
          <span className="text-muted-foreground w-12 text-center text-sm">
            {scalePct}%
          </span>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => zoom(1)}
            aria-label="Zoom in"
          >
            <ZoomIn className="size-4" />
          </Button>
        </div>

        <form
          className="ml-auto flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            find(false);
          }}
        >
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
            <input
              className="border-input bg-background h-8 w-36 rounded-md border pr-2 pl-7 text-sm sm:w-44"
              placeholder="Find in document"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Find in document"
            />
          </div>
          {query.trim() !== "" && matches && (
            <span className="text-muted-foreground min-w-10 text-center text-xs tabular-nums">
              {matches.total ? `${matches.current}/${matches.total}` : "0"}
            </span>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            type="button"
            onClick={() => find(true, true)}
            disabled={query.trim() === ""}
            aria-label="Previous match"
          >
            <ChevronUp className="size-4" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            type="button"
            onClick={() => find(true, false)}
            disabled={query.trim() === ""}
            aria-label="Next match"
          >
            <ChevronDown className="size-4" />
          </Button>
        </form>
      </div>

      {/* ── Pages ──────────────────────────────────────────────────────── */}
      <div className="relative min-h-0 flex-1">
        {state === "loading" && (
          <div className="bg-muted/50 text-muted-foreground absolute inset-0 flex items-center justify-center gap-2 text-sm">
            <Loader2 className="size-5 animate-spin" />
            Loading the document…
          </div>
        )}
        {state === "error" && (
          <div className="bg-muted/50 text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm">
            <span>This document couldn&rsquo;t be shown in the app.</span>
            {allowNewTab && (
              <Button
                variant="outline"
                nativeButton={false}
                render={
                  <a href={url} target="_blank" rel="noopener noreferrer" />
                }
              >
                <ExternalLink className="size-4" /> Open it in a new tab
              </Button>
            )}
          </div>
        )}
        {/* pdf.js owns everything inside this scroll container. */}
        <div
          ref={containerRef}
          aria-label={name ? `${name}, PDF` : "PDF document"}
          className={cn(
            "pdfReaderContainer bg-muted absolute inset-0 overflow-auto",
            state !== "ready" && "invisible",
          )}
        >
          <div ref={viewerRef} className="pdfViewer" />
        </div>
      </div>
    </div>
  );
}
