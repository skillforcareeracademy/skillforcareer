/**
 * Which panel sections a company admin may open.
 *
 * An allowlist, and a pure one — no database, no error types — because the
 * proxy imports it on every request to `/admin`. A section joins this list
 * once its queries are company-scoped and its writes are ownership-checked,
 * so a screen nobody has got to yet is shut rather than leaking. A tenant leak
 * is not a bug found in testing; it is one found by a customer, in another
 * customer's data.
 *
 * Everything the academy keeps to itself — its public website, its platform
 * settings, its roles, its own money — is simply absent.
 */
export const COMPANY_ADMIN_SECTIONS: readonly string[] = [
  "", // the dashboard itself
  "users",
  "companies/me",
];

/** Whether a company admin may open `/admin/<pathAfterAdmin>`. */
export function companyAdminMayOpen(pathAfterAdmin: string): boolean {
  const head = pathAfterAdmin.replace(/^\/+|\/+$/g, "");
  return COMPANY_ADMIN_SECTIONS.some(
    (allowed) => head === allowed || head.startsWith(`${allowed}/`),
  );
}
