import { ZodError } from "zod";
import { AppError } from "./errors";
import { fail } from "./response";
import { logger } from "../logger";

type RouteContext = { params: Promise<Record<string, string | string[]>> };
type RouteHandler = (
  req: Request,
  context: RouteContext,
) => Promise<Response> | Response;

/**
 * Wraps a route handler so thrown `AppError`s, Zod validation errors, and
 * unexpected exceptions become the standard JSON error envelope. Business logic
 * can `throw AppError.notFound(...)` instead of hand-building responses.
 */
export function withRoute(handler: RouteHandler): RouteHandler {
  return async (req, context) => {
    try {
      return await handler(req, context);
    } catch (error) {
      if (error instanceof ZodError) {
        return fail("VALIDATION_ERROR", "Validation failed", 422, {
          issues: error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        });
      }

      if (error instanceof AppError) {
        // Client/expected errors are logged at warn; server errors at error.
        if (error.status >= 500) {
          logger.error(error.message, { code: error.code });
        } else {
          logger.warn(error.message, { code: error.code });
        }
        return fail(error.code, error.message, error.status, error.details);
      }

      logger.error("Unhandled route error", {
        error: error instanceof Error ? error.message : String(error),
      });
      return fail("INTERNAL_ERROR", "Something went wrong", 500);
    }
  };
}
