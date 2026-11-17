import { redirect } from "next/navigation";
import { getSession } from "./auth";
import { connectDB } from "./db";
import { loadActor } from "./access";
import type { Permission } from "./rbac";

/** Server-side page guard: a direct URL to a page the user may not use redirects away before anything renders. */
export async function requirePage(anyOf: Permission[]) {
  const token = await getSession();
  if (!token) redirect("/login");
  await connectDB();
  const actor = await loadActor(token);
  if (!actor) redirect("/login");
  if (anyOf.length && !anyOf.some((p) => actor.can(p))) redirect("/dashboard");
  return actor;
}
