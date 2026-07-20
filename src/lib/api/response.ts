import { NextResponse } from "next/server";
import type { ErrorCode } from "./errors";

/**
 * Standard API response envelopes. Every route handler returns one of these so
 * the client can rely on a single shape.
 */
export type ApiSuccess<T> = {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
};

export type ApiError = {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function ok<T>(
  data: T,
  init?: { status?: number; meta?: Record<string, unknown> },
) {
  return NextResponse.json<ApiSuccess<T>>(
    { success: true, data, ...(init?.meta ? { meta: init.meta } : {}) },
    { status: init?.status ?? 200 },
  );
}

export function created<T>(data: T, meta?: Record<string, unknown>) {
  return ok(data, { status: 201, meta });
}

export function paginated<T>(items: T[], pagination: PaginationMeta) {
  return ok(items, { meta: { pagination } });
}

export function fail(
  code: ErrorCode,
  message: string,
  status: number,
  details?: unknown,
) {
  return NextResponse.json<ApiError>(
    { success: false, error: { code, message, ...(details ? { details } : {}) } },
    { status },
  );
}

export function buildPaginationMeta(
  page: number,
  pageSize: number,
  total: number,
): PaginationMeta {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
