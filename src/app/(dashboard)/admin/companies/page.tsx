import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/require";
import { ROLES } from "@/config/roles";
import { listCompanies } from "@/server/services/company-service";
import { ROOT_DOMAIN } from "@/server/services/company-domain-service";
import { CompaniesClient } from "@/components/admin/companies/companies-client";

export const metadata: Metadata = { title: "Companies" };
export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  // The academy's own super admin and nobody else. A company admin reaching
  // this URL is sent back to its dashboard rather than shown the customer
  // list — which is the one page that would reveal every other tenant.
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.companyId || user.role !== ROLES.SUPER_ADMIN) redirect("/admin");

  return (
    <CompaniesClient
      companies={await listCompanies()}
      rootDomain={ROOT_DOMAIN}
    />
  );
}
