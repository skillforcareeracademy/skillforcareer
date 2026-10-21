"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
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
 * The worker is served from our own origin (public/pdf.worker.min.mjs, pinned
 * to the installed pdfjs-dist) so it needs no third-party origin and no CSP
 * exception.
 */
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
  const holder = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [pages, setPages] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const canvases: HTMLCanvasElement[] = [];

    async function render() {
      setState("loading");
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        const doc = await pdfjs.getDocument({ url }).promise;
        if (cancelled) return;
        setPages(doc.numPages);

        const host = holder.current;
        if (!host) return;
        host.replaceChildren();

        // Fit the page to the dialog, then sharpen for the device's pixels.
        const width = Math.min(host.clientWidth || 640, 1100);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        for (let n = 1; n <= doc.numPages; n++) {
          if (cancelled) return;
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const scale = (width / base.width) * dpr;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.className = "mb-3 rounded-lg border bg-white shadow-sm";
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          host.appendChild(canvas);
          canvases.push(canvas);
          await page.render({ canvasContext: ctx, viewport }).promise;
        }
        if (!cancelled) setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    }

    void render();
    return () => {
      cancelled = true;
      for (const c of canvases) {
        c.width = 0;
        c.height = 0;
      }
    };
  }, [url]);

  return (
    <div className="space-y-3">
      {state === "loading" && (
        <div className="bg-muted/50 text-muted-foreground flex h-[60vh] flex-col items-center justify-center gap-2 rounded-lg border text-sm">
          <Loader2 className="size-5 animate-spin" />
          Loading the document…
        </div>
      )}

      {state === "error" && (
        <div className="bg-muted/50 text-muted-foreground flex h-[40vh] flex-col items-center justify-center gap-3 rounded-lg border p-6 text-center text-sm">
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

      <div
        ref={holder}
        className={
          state === "ready"
            ? cn(
                "overflow-y-auto rounded-lg",
                maximized ? "max-h-[86vh]" : "max-h-[72vh]",
              )
            : "hidden"
        }
      />

      {state === "ready" && pages > 0 && (
        <p className="text-muted-foreground text-center text-xs">
          {name ? `${name} · ` : ""}
          {pages} {pages === 1 ? "page" : "pages"}
        </p>
      )}
    </div>
  );
}
