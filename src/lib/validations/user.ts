import { z } from "zod";
import { ROLES } from "@/config/roles";

export const USER_STATUSES = [
  "PENDING",
  "ACTIVE",
  "INACTIVE",
  "SUSPENDED",
] as const;

export const roleSlugEnum = z.enum([
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.INSTRUCTOR,
  ROLES.STUDENT,
  ROLES.SALES_AGENT,
]);

/** "" clears the date; omitted leaves it alone. */
const optionalDay = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .or(z.literal(""))
  .optional();

export const updateUserAdminSchema = z
  .object({
    name: z.string().trim().min(2, "Name is too short.").max(120).optional(),
    email: z.string().trim().toLowerCase().email("Enter a valid email.").optional(),
    roleSlug: roleSlugEnum.optional(),
    status: z.enum(USER_STATUSES).optional(),
    internshipStartAt: optionalDay,
    internshipEndAt: optionalDay,
  })
  .refine(
    (d) =>
      d.name ||
      d.email ||
      d.roleSlug ||
      d.status ||
      d.internshipStartAt !== undefined ||
      d.internshipEndAt !== undefined,
    { message: "Provide at least one field to update." },
  );

export type UpdateUserAdminInput = z.infer<typeof updateUserAdminSchema>;

export const createUserAdminSchema = z.object({
  name: z.string().trim().min(2, "Name is too short.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  roleSlug: roleSlugEnum,
  status: z.enum(USER_STATUSES).default("ACTIVE"),
});

export type CreateUserAdminInput = z.infer<typeof createUserAdminSchema>;

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional(),
  role: z.string().trim().optional(),
  status: z.string().trim().optional(),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;

/** The full set of extra roles a person holds besides their primary one. */
export const setExtraRolesSchema = z.object({
  extraRoles: z.array(roleSlugEnum).max(5),
});

/** Give an existing person one more role. */
export const addExtraRoleSchema = z.object({ roleSlug: roleSlugEnum });

/**
 * Bulk-create accounts from a CSV (name, email, phone, role, password). A row
 * whose email already has an account gets the row's role added to it instead,
 * when `addRoleToExisting` is on — the usual reason it's in the sheet twice.
 */
export const importUsersSchema = z.object({
  csv: z.string().min(1, "Paste or upload a CSV first").max(2_000_000),
  defaultRole: roleSlugEnum.default(ROLES.STUDENT),
  addRoleToExisting: z.boolean().default(true),
  sendWelcome: z.boolean().default(true),
});

export type ImportUsersInput = z.infer<typeof importUsersSchema>;
