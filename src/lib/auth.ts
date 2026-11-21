import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { sql } from "./db";
import { randomToken, sha256 } from "./crypto";
import { getSetting } from "./settings";
import type { Permission } from "./permissions";

export const SESSION_COOKIE = "tt_session";

export type SessionUser = {
  id: number;
  username: string;
  fullName: string;
  email: string | null;
  roleId: number;
  roleName: string;
  facultyId: number | null;
  facultyName: string | null;
};

export type Session = { user: SessionUser; permissions: Set<string>; sessionId: string };

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || null;
}

export async function createSession(userId: number) {
  const token = randomToken();
  const { sessionHours } = await getSetting("security");
  const expires = new Date(Date.now() + sessionHours * 3600_000);
  const h = await headers();
  await sql`insert into sessions (id, user_id, expires_at, ip, user_agent)
    values (${sha256(token)}, ${userId}, ${expires}, ${await clientIp()}, ${h.get("user-agent")?.slice(0, 300) ?? null})`;
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await sql`delete from sessions where id = ${sha256(token)}`;
  jar.delete(SESSION_COOKIE);
}

export const getSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const id = sha256(token);
  const [row] = await sql`
    select s.id as sid, s.expires_at, u.id, u.username, u.full_name, u.email, u.role_id, r.name as role_name,
           u.faculty_id, f.name as faculty_name, u.is_active,
           coalesce(array_agg(rp.permission_code) filter (where rp.permission_code is not null), '{}') as perms
    from sessions s
    join users u on u.id = s.user_id
    join roles r on r.id = u.role_id
    left join faculties f on f.id = u.faculty_id
    left join role_permissions rp on rp.role_id = r.id
    where s.id = ${id}
    group by s.id, u.id, r.name, f.name`;
  if (!row || !row.is_active || new Date(row.expires_at) < new Date()) return null;

  // Sliding expiry: extend when less than half the lifetime remains.
  const { sessionHours } = await getSetting("security");
  const remaining = new Date(row.expires_at).getTime() - Date.now();
  if (remaining < (sessionHours * 3600_000) / 2) {
    await sql`update sessions set expires_at = now() + ${`${sessionHours} hours`}::interval where id = ${id}`;
  }
  return {
    sessionId: id,
    permissions: new Set(row.perms as string[]),
    user: {
      id: row.id, username: row.username, fullName: row.full_name, email: row.email,
      roleId: row.role_id, roleName: row.role_name, facultyId: row.faculty_id, facultyName: row.faculty_name,
    },
  };
});

/** For server components / pages: redirect to login or show forbidden. */
export async function requirePage(permission?: Permission | Permission[]): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (permission) {
    const list = Array.isArray(permission) ? permission : [permission];
    if (!list.some((p) => s.permissions.has(p))) redirect("/forbidden");
  }
  return s;
}

export const can = (s: Session | null, p: Permission) => !!s?.permissions.has(p);
