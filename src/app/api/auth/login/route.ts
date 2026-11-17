import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { User } from "@/lib/models";
import { setSessionCookie, verifyPassword } from "@/lib/auth";

const schema = z.object({ email: z.string().email("Enter a valid email"), password: z.string().min(1, "Password is required") });

// Simple in-memory throttle (per email+process). Use Redis for multi-instance deployments.
const fails = new Map<string, { n: number; until: number }>();

export async function POST(req: Request) {
  try {
    const { email, password } = schema.parse(await req.json());
    const key = email.toLowerCase();
    const f = fails.get(key);
    if (f && f.until > Date.now()) return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
    await connectDB();
    const user = await User.findOne({ email: key, deletedAt: null }).select("+passwordHash");
    const ok = user && user.active && (await verifyPassword(password, user.passwordHash));
    if (!ok) {
      const n = (f?.n ?? 0) + 1;
      fails.set(key, { n, until: n >= 5 ? Date.now() + 5 * 60_000 : 0 });
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }
    fails.delete(key);
    await User.updateOne({ _id: user._id }, { lastLoginAt: new Date() });
    await setSessionCookie({ userId: String(user._id), hotelId: String(user.hotel), role: user.role, name: user.name, email: user.email });
    return NextResponse.json({ data: { name: user.name, role: user.role } });
  } catch (e) {
    return errorResponse(e);
  }
}
