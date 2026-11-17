import { route } from "@/lib/api";
import { Hotel, Settings, User } from "@/lib/models";

export const GET = route(null, async ({ session }) => {
  const [hotel, settings, me] = await Promise.all([Hotel.findById(session.hotelId).lean(), Settings.findOne({ hotel: session.hotelId }).lean(), User.findById(session.userId).lean<any>()]);
  return { user: { userId: session.userId, name: session.name, email: session.email, role: session.role, pinSet: !!me?.pinSet }, permissions: [...session.perms], discountPolicy: session.discountPolicy, hotel, settings };
});
