import { z } from "zod";
import { sql } from "@/lib/db";
import { route, ApiError, requireIp } from "@/lib/api";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getSetting } from "@/lib/settings";
import { passwordProblems } from "@/lib/password";

const Body = z.object({ current: z.string().min(1), next: z.string().min(1).max(200) });

export const POST = route(null, async (req, s) => {
  const { current, next } = Body.parse(await req.json());
  const [u] = await sql`select password_hash from users where id = ${s.user.id}`;
  if (!(await verifyPassword(current, u.password_hash))) throw new ApiError(400, "Current password is incorrect");
  const problems = passwordProblems(next, (await getSetting("security")).minPasswordLength);
  if (problems.length) throw new ApiError(400, problems.join(" "));
  await sql`update users set password_hash = ${await hashPassword(next)}, password_changed_at = now() where id = ${s.user.id}`;
  await sql`delete from sessions where user_id = ${s.user.id} and id <> ${s.sessionId}`;
  await audit(s.user.id, "PASSWORD_CHANGED", "user", s.user.id, null, requireIp(req));
  return { ok: true };
});
