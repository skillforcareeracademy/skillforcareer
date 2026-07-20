"use client";

import { useEffect } from "react";
import { useAuthStore, type SessionUser } from "@/stores/auth-store";

/** Syncs the server-resolved user into the client auth store on mount. */
export function AuthHydrator({ user }: { user: SessionUser }) {
  const setUser = useAuthStore((s) => s.setUser);
  useEffect(() => {
    setUser(user);
  }, [user, setUser]);
  return null;
}
