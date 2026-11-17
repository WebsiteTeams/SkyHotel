"use client";
import { createContext, useContext } from "react";
import type { Permission, Role } from "@/lib/rbac";

export interface ClientSession {
  name: string;
  email: string;
  role: Role;
  hotelName: string;
  permissions: Permission[];
}
const Ctx = createContext<ClientSession | null>(null);
export const SessionProvider = Ctx.Provider;
export const useSession = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error("No session");
  return s;
};
export const useCan = () => {
  const s = useSession();
  return (p: Permission) => s.permissions.includes(p);
};
