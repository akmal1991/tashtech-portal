import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { getSession, type Session } from "./auth";
import type { Permission } from "./permissions";

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}

type Ctx<P> = { params: Promise<P> };

/** Wraps a route handler: authentication, optional permission check, uniform error JSON. */
export function route<P = Record<string, string>>(
  permission: Permission | Permission[] | null,
  handler: (req: NextRequest, session: Session, params: P) => Promise<Response | unknown>,
) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    try {
      const session = await getSession();
      if (!session) throw new ApiError(401, "Not authenticated");
      if (permission) {
        const list = Array.isArray(permission) ? permission : [permission];
        if (!list.some((p) => session.permissions.has(p))) throw new ApiError(403, "You do not have permission to perform this action");
      }
      const result = await handler(req, session, (await ctx.params) as P);
      return result instanceof Response ? result : NextResponse.json(result ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown) {
  if (e instanceof ApiError) return NextResponse.json({ error: e.message, details: e.details }, { status: e.status });
  if (e instanceof ZodError) {
    const msg = e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  const pg = e as { code?: string; detail?: string; message?: string; constraint_name?: string };
  if (pg?.code === "23505") return NextResponse.json({ error: "Duplicate value: " + (pg.detail ?? pg.constraint_name ?? "record already exists") }, { status: 409 });
  if (pg?.code === "23503") return NextResponse.json({ error: "This record is referenced by other data and cannot be removed or linked: " + (pg.detail ?? "") }, { status: 409 });
  if (pg?.code === "23514") return NextResponse.json({ error: "Value not allowed: " + (pg.constraint_name ?? "") }, { status: 400 });
  console.error(e);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export function requireIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || null;
}

export function assert(cond: unknown, status: number, message: string): asserts cond {
  if (!cond) throw new ApiError(status, message);
}
