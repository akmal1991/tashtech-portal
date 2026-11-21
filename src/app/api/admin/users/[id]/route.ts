import { sql } from "@/lib/db";
import { route, requireIp, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { passwordProblems } from "@/lib/password";
import { UserBody } from "@/lib/admin-schemas";

type P = { id: string };

export const PUT = route<P>("users.manage", async (req, s, { id }) => {
  const uid = Number(id);
  const b = UserBody.parse(await req.json());
  const [before] = await sql`select u.*, r.name as role_name from users u join roles r on r.id = u.role_id where u.id = ${uid}`;
  if (!before) throw new ApiError(404, "User not found");
  if (uid === s.user.id && (!b.is_active || b.role_id !== before.role_id)) throw new ApiError(400, "You cannot deactivate yourself or change your own role");
  // Only users who manage roles can assign / edit Administrator-level accounts
  const [targetRole] = await sql`select count(*)::int as n from role_permissions where role_id = ${b.role_id} and permission_code = 'roles.manage'`;
  if ((targetRole.n > 0 || before.role_name === "Administrator") && !s.permissions.has("roles.manage"))
    throw new ApiError(403, "Only administrators can manage administrator accounts");
  let pwHash: string | null = null;
  if (b.password) {
    const problems = passwordProblems(b.password, (await getSetting("security")).minPasswordLength);
    if (problems.length) throw new ApiError(400, problems.join(" "));
    pwHash = await hashPassword(b.password);
  }
  await sql.begin(async (tx) => {
    await tx`update users set username = ${b.username}, full_name = ${b.full_name}, email = ${b.email ?? null}, role_id = ${b.role_id},
      faculty_id = ${b.faculty_id ?? null}, is_active = ${b.is_active},
      password_hash = coalesce(${pwHash}, password_hash), password_changed_at = case when ${pwHash}::text is null then password_changed_at else now() end,
      failed_attempts = 0, locked_until = null
      where id = ${uid}`;
    if (b.course_ids) {
      await tx`delete from user_course_assignments where user_id = ${uid}`;
      if (b.course_ids.length) await tx`insert into user_course_assignments ${tx(b.course_ids.map((c) => ({ user_id: uid, course_id: c })))}`;
    }
    if (!b.is_active || pwHash) await tx`delete from sessions where user_id = ${uid}`;
  });
  await audit(s.user.id, pwHash ? "USER_UPDATED_PASSWORD_RESET" : "USER_UPDATED", "user", uid,
    { username: b.username, role_id: b.role_id, faculty_id: b.faculty_id, is_active: b.is_active, courses: b.course_ids?.length }, requireIp(req));
  return { ok: true };
});
