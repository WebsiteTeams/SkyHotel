import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { getSession } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Hotel } from "@/lib/models";
import { loadActor } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect("/login");
  await connectDB();
  // Role, status and permissions are re-read on every navigation so changes apply immediately.
  const [actor, hotel] = await Promise.all([loadActor(s), Hotel.findById(s.hotelId, "name")]);
  if (!actor) redirect("/login");
  return (
    <Shell session={{ name: actor.name, email: actor.email, role: actor.role, hotelName: hotel?.name ?? "SkyHotel", permissions: [...actor.perms] }}>
      {children}
    </Shell>
  );
}
