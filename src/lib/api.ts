import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { connectDB } from "./db";
import { getSession } from "./auth";
import { loadActor, type Actor } from "./access";
import type { Permission } from "./rbac";

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}
export const bad = (m: string, d?: unknown) => new ApiError(400, m, d);
export const notFound = (m = "Not found") => new ApiError(404, m);
export const forbidden = (m = "You do not have permission to do this") => new ApiError(403, m);
export const conflict = (m: string) => new ApiError(409, m);

interface Ctx<P> {
  req: NextRequest;
  session: Actor; // role / permissions come from the database, not the token
  actor: Actor;
  can: (p: Permission) => boolean;
  params: P;
  query: URLSearchParams;
  body: <T>(schema: ZodType<T>) => Promise<T>;
}

/** Wraps a route handler with auth, server-side RBAC, DB connection and uniform errors. */
export function route<P = Record<string, string>>(
  perm: Permission | Permission[] | null,
  handler: (c: Ctx<P>) => Promise<unknown>,
) {
  return async (req: NextRequest, ctx: { params: Promise<P> }) => {
    try {
      const token = await getSession();
      if (!token) throw new ApiError(401, "Please sign in");
      await connectDB();
      const session = await loadActor(token);
      if (!session) throw new ApiError(401, "Your account is inactive or no longer exists");
      const perms = perm == null ? [] : Array.isArray(perm) ? perm : [perm];
      if (perms.length && !perms.some((p) => session.can(p))) throw forbidden();
      const params = (await ctx.params) ?? ({} as P);
      const out = await handler({
        req,
        session,
        actor: session,
        can: session.can,
        params,
        query: req.nextUrl.searchParams,
        body: async (schema) => {
          let json: unknown;
          try {
            json = await req.json();
          } catch {
            throw bad("Invalid JSON body");
          }
          return schema.parse(json);
        },
      });
      if (out instanceof Response) return out;
      return NextResponse.json({ data: out ?? null });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown) {
  if (e instanceof ApiError) return NextResponse.json({ error: e.message, details: e.details }, { status: e.status });
  if (e instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const i of e.issues) fields[i.path.join(".") || "_"] ??= i.message;
    return NextResponse.json({ error: "Please check the highlighted fields", details: fields }, { status: 400 });
  }
  const err = e as { code?: number; name?: string; message?: string; keyPattern?: Record<string, unknown> };
  if (err.code === 11000)
    return NextResponse.json({ error: `Duplicate value for ${Object.keys(err.keyPattern ?? {}).join(", ") || "field"}` }, { status: 409 });
  if (err.name === "ValidationError" || err.name === "CastError")
    return NextResponse.json({ error: err.message }, { status: 400 });
  console.error(e);
  return NextResponse.json({ error: "Something went wrong on the server" }, { status: 500 });
}

export function paging(q: URLSearchParams, defaultLimit = 20) {
  const page = Math.max(1, Number(q.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(q.get("limit")) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}
export const pageResult = <T>(items: T[], total: number, page: number, limit: number) => ({
  items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)),
});

/** Escape user text for use inside a RegExp. */
export const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function dateRange(q: URLSearchParams, fallbackDays = 30) {
  const to = q.get("to") ? new Date(q.get("to") + "T23:59:59.999") : new Date();
  const from = q.get("from")
    ? new Date(q.get("from") + "T00:00:00")
    : new Date(new Date().setHours(0, 0, 0, 0) - (fallbackDays - 1) * 86400000);
  return { from, to };
}
