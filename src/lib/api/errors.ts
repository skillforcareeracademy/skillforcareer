/**
 * Typed application errors.
 *
 * Route handlers throw these; `withRoute` (./handler.ts) maps them to a
 * consistent JSON error envelope with the right HTTP status. This keeps status
 * codes and error shapes out of business logic.
 */
export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_ERROR: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }

  static badRequest(message = "Bad request", details?: unknown) {
    return new AppError("BAD_REQUEST", message, details);
  }
  static unauthorized(message = "Authentication required") {
    return new AppError("UNAUTHORIZED", message);
  }
  static forbidden(message = "You do not have access to this resource") {
    return new AppError("FORBIDDEN", message);
  }
  static notFound(message = "Resource not found") {
    return new AppError("NOT_FOUND", message);
  }
  static conflict(message = "Resource already exists") {
    return new AppError("CONFLICT", message);
  }
  static validation(message = "Validation failed", details?: unknown) {
    return new AppError("VALIDATION_ERROR", message, details);
  }
  static rateLimited(message = "Too many requests") {
    return new AppError("RATE_LIMITED", message);
  }
  static internal(message = "Something went wrong") {
    return new AppError("INTERNAL_ERROR", message);
  }
}
