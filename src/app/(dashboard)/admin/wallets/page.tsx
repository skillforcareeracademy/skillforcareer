import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/require";
import { PERMISSIONS } from "@/config/roles";
import { adminWalletsView } from "@/server/services/wallet-service";
import { WalletsClient } from "@/components/admin/wallets-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Wallets" };

export default async function AdminWalletsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission(PERMISSIONS.MANAGE_PAYMENTS);
  const sp = await searchParams;
  const search = typeof sp.search === "string" && sp.search ? sp.search : undefined;
  const view = await adminWalletsView(search);

  return (
    <WalletsClient
      pending={view.pending}
      settled={view.settled}
      wallets={view.wallets}
      totalHeld={view.totalHeld}
    />
  );
}
