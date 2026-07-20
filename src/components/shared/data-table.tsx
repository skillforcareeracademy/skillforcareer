"use client";

import type { ReactNode } from "react";
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
}: DataTableProps<T>) {
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
                <TableHead key={c.key} className={c.headerClassName}>
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((c) => (
                    <TableCell key={c.key} className={c.className}>
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
                    <TableCell key={c.key} className={c.className}>
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
