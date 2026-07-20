import { create } from "zustand";
import type { Role } from "@/config/roles";

/** Client-side view of the authenticated user (mirrors the API's PublicUser). */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
  status: string;
  permissions: string[];
}

interface AuthState {
  user: SessionUser | null;
  setUser: (user: SessionUser | null) => void;
  clear: () => void;
}

/**
 * The source of truth for auth is the httpOnly cookie session; this store just
 * mirrors the current user for reactive client UI (header, menus). It is
 * hydrated from the server session on the dashboard and updated by auth forms.
 */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  clear: () => set({ user: null }),
}));
