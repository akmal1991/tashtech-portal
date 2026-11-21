import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { createSession, verifyPassword, hashPassword, clientIp } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getSetting } from "@/lib/settings";
import { errorResponse } from "@/lib/api";

const Body = z.object({ username: z.string().trim().min(1).max(100), password: z.string().min(1).max(200) });
const GENERIC = "Invalid username or password";
let DUMMY_HASH: string | undefined;

export async function POST(req: NextRequest) {
  try {
    const { username, password } = Body.parse(await req.json());
    const ip = await clientIp();
    const sec = await getSetting("security");
    const [u] = await sql`select id, password_hash, is_active, failed_attempts, locked_until from users where lower(username) = lower(${username})`;
    if (!u) {
      await verifyPassword(password, (DUMMY_HASH ??= await hashPassword("timing-equaliser"))); // equalise timing
      await audit(null, "LOGIN_FAILED", "user", null, { username }, ip);
      return NextResponse.json({ error: GENERIC }, { status: 401 });
    }
    if (u.locked_until && new Date(u.locked_until) > new Date()) {
      await audit(u.id, "LOGIN_BLOCKED", "user", u.id, { reason: "account temporarily locked" }, ip);
      return NextResponse.json({ error: "Too many failed attempts. Try again later." }, { status: 429 });
    }
    const ok = await verifyPassword(password, u.password_hash);
    if (!ok || !u.is_active) {
      const attempts = u.failed_attempts + 1;
      const lock = attempts >= sec.maxFailedAttempts;
      await sql`update users set failed_attempts = ${lock ? 0 : attempts},
        locked_until = ${lock ? new Date(Date.now() + sec.lockoutMinutes * 60_000) : null} where id = ${u.id}`;
      await audit(u.id, lock ? "ACCOUNT_LOCKED" : "LOGIN_FAILED", "user", u.id, { attempts, inactive: !u.is_active }, ip);
      return NextResponse.json({ error: u.is_active ? GENERIC : "Account is deactivated" }, { status: 401 });
    }
    await sql`update users set failed_attempts = 0, locked_until = null, last_login_at = now() where id = ${u.id}`;
    await sql`delete from sessions where user_id = ${u.id} and expires_at < now()`;
    await createSession(u.id);
    await audit(u.id, "LOGIN", "user", u.id, null, ip);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
