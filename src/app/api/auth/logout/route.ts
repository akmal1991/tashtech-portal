import { NextResponse } from "next/server";
import { destroySession, getSession, clientIp } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function POST() {
  const s = await getSession();
  if (s) await audit(s.user.id, "LOGOUT", "user", s.user.id, null, await clientIp());
  await destroySession();
  return NextResponse.json({ ok: true });
}
