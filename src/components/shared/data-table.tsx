"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
  /**
   * Pin the column against an edge so it survives horizontal scrolling.
   *
   * "Ye 3 dots sabse aage lekar aao. Mujhe scroll krna pdta hai left right
   * bhot to access these three dots." An actions column at the far right of a
   * wide table is a column nobody can reach.
   */
  sticky?: "left" | "right";
  /** Starting width in pixels. The reader can drag it from there. */
  width?: number;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: LucideIcon;
  toolbar?: ReactNode;
  footer?: ReactNode;
  /** When provided, small screens render this card per row instead of the
   *  horizontally-scrolling table (which stays for md and up). */
  renderCard?: (row: T) => ReactNode;
  /**
   * Remember the reader's column widths under this name.
   *
   * Widths are a per-person preference about their own screen, so they live in
   * that browser rather than in the database — and a list without a name here
   * simply is not resizable, which keeps the handles off tables where they
   * would be noise.
   */
  storageKey?: string;
}

/** Presentational, generic table with loading + empty states. */
export function DataTable<T>({
  columns,
  data,
  rowKey,
  loading = false,
  emptyTitle = "No records found",
  emptyDescription,
  emptyIcon,
  toolbar,
  footer,
  renderCard,
  storageKey,
}: DataTableProps<T>) {
  const [widths, setWidths] = useState<Record<string, number>>({});
  const drag = useRef<{ key: string; startX: number; startW: number } | null>(null);

  // Read back what this reader set last time. In an effect, not in the initial
  // state, so the server and the first client render agree.
  useEffect(() => {
    if (!storageKey) return;
    const t = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem(`sfc.cols.${storageKey}`);
        if (raw) setWidths(JSON.parse(raw) as Record<string, number>);
      } catch {
        // Site data blocked, or nonsense stored: the defaults are fine.
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [storageKey]);

  const onResizeStart = useCallback(
    (key: string, event: React.PointerEvent<HTMLSpanElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const cell = (event.currentTarget.closest("th") as HTMLElement | null);
      drag.current = {
        key,
        startX: event.clientX,
        startW: cell?.getBoundingClientRect().width ?? 160,
      };

      const move = (e: PointerEvent) => {
        if (!drag.current) return;
        // A column narrower than this is unreadable whatever is in it.
        const next = Math.max(64, drag.current.startW + (e.clientX - drag.current.startX));
        setWidths((w) => ({ ...w, [drag.current!.key]: Math.round(next) }));
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        drag.current = null;
        setWidths((w) => {
          if (storageKey) {
            try {
              localStorage.setItem(`sfc.cols.${storageKey}`, JSON.stringify(w));
            } catch {
              // Nothing to do; the widths still hold for this visit.
            }
          }
          return w;
        });
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [storageKey],
  );

  /** Pinned columns sit above the rest and carry the surface colour with them. */
  const stickyClass = (c: Column<T>, header: boolean) =>
    c.sticky === "left"
      ? cn("sticky left-0 z-20", header ? "bg-muted" : "bg-background")
      : c.sticky === "right"
        ? cn("sticky right-0 z-20", header ? "bg-muted" : "bg-background")
        : undefined;
  const empty = (
    <EmptyState
      icon={emptyIcon}
      title={emptyTitle}
      description={emptyDescription}
      className="rounded-none border-0 bg-transparent"
    />
  );

  const tableEl = (
    <div
      className={cn(
        "overflow-hidden rounded-xl border",
        renderCard && "hidden md:block",
      )}
    >
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              {columns.map((c) => (
                <TableHead
                  key={c.key}
                  className={cn("relative", stickyClass(c, true), c.headerClassName)}
                  style={
                    widths[c.key] || c.width
                      ? { width: widths[c.key] ?? c.width, minWidth: widths[c.key] ?? c.width }
                      : undefined
                  }
                >
                  {c.header}
                  {/* The grip between this column and the next — "allow me to
                      adjust the column width of this list". */}
                  {storageKey && (
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      aria-label="Drag to resize this column"
                      onPointerDown={(e) => onResizeStart(c.key, e)}
                      onDoubleClick={() =>
                        setWidths((w) => {
                          const next = { ...w };
                          delete next[c.key];
                          return next;
                        })
                      }
                      className="hover:bg-primary/40 absolute top-0 right-0 h-full w-1.5 cursor-col-resize touch-none select-none"
                    />
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((c) => (
                    <TableCell
                      key={c.key}
                      className={cn(stickyClass(c, false), c.className)}
                    >
                      <Skeleton className="h-5 w-full max-w-[180px]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : data.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="p-0">
                  {empty}
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => (
                <TableRow key={rowKey(row)}>
                  {columns.map((c) => (
                    <TableCell
                      key={c.key}
                      className={cn(stickyClass(c, false), c.className)}
                      style={
                        widths[c.key] || c.width
                          ? { width: widths[c.key] ?? c.width }
                          : undefined
                      }
                    >
                      {c.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {toolbar}

      {/* Mobile card layout (only when renderCard is supplied) */}
      {renderCard && (
        <div className="space-y-3 md:hidden">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))
          ) : data.length === 0 ? (
            <div className="rounded-xl border">{empty}</div>
          ) : (
            data.map((row) => <div key={rowKey(row)}>{renderCard(row)}</div>)
          )}
        </div>
      )}

      {tableEl}
      {footer}
    </div>
  );
}
