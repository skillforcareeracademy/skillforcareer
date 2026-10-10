/**
 * The tenant isolation rules, checked.
 *
 *   npx tsx --env-file=.env scripts/check-tenant-isolation.ts
 *
 * These are the rules that keep one company out of another's data, so they
 * are worth being able to re-run rather than reasoned about afresh each time
 * someone touches the guards. Exits non-zero on any failure.
 */
import { ROLES } from "../src/config/roles";
import {
  assertSameCompany,
  companyScope,
  ownerCompanyScope,
  isAcademyStaff,
} from "../src/lib/auth/tenant";
import { companyAdminMayOpen } from "../src/lib/auth/tenant-sections";

const academy = { id: "a", role: ROLES.SUPER_ADMIN, companyId: null };
const acme = { id: "b", role: ROLES.COMPANY_ADMIN, companyId: "acme" };

let pass = 0, fail = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}${ok ? "" : ` — got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
  if (ok) pass += 1;
  else fail += 1;
};
const throws = (label: string, fn: () => void) => {
  try { fn(); console.log(`FAIL  ${label} — did not throw`); fail++; }
  catch { console.log(`ok    ${label}`); pass++; }
};
const nothrow = (label: string, fn: () => void) => {
  try { fn(); console.log(`ok    ${label}`); pass++; }
  catch (e) { console.log(`FAIL  ${label} — threw ${e}`); fail++; }
};

check("academy list filter is unrestricted", companyScope(academy), {});
check("tenant list filter is narrowed", companyScope(acme), { companyId: "acme" });
check("academy owner-filter unrestricted", ownerCompanyScope(academy), {});
check("tenant owner-filter narrowed", ownerCompanyScope(acme), { user: { companyId: "acme" } });
check("super admin is academy staff", isAcademyStaff(academy), true);
check("company admin is not academy staff", isAcademyStaff(acme), false);

nothrow("academy may reach another company's row", () => assertSameCompany(academy, "acme"));
nothrow("tenant may reach its own row", () => assertSameCompany(acme, "acme"));
throws("tenant refused another company's row", () => assertSameCompany(acme, "globex"));
throws("tenant refused an academy row", () => assertSameCompany(acme, null));

check("tenant may open the dashboard", companyAdminMayOpen("/"), true);
check("tenant may open users", companyAdminMayOpen("/users"), true);
check("tenant may open a user detail", companyAdminMayOpen("/users/abc123"), true);
check("tenant refused settings", companyAdminMayOpen("/settings"), false);
check("tenant refused homepage", companyAdminMayOpen("/homepage"), false);
check("tenant refused roles", companyAdminMayOpen("/permissions"), false);
check("tenant refused payments (not yet scoped)", companyAdminMayOpen("/payments"), false);
check("tenant refused companies list", companyAdminMayOpen("/companies"), false);
check("tenant may open its own company", companyAdminMayOpen("/companies/me"), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
