import { UserBody } from "@/lib/admin-schemas";
import { z } from "zod";
import { sql } from "@/lib/db";
import { route, requireIp, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { passwordProblems } from "@/lib/password";

export const POST = route("users.manage", async (req, s) => {
  const b = UserBody.parse(await req.json());
  if (!b.password) throw new ApiError(400, "Password is required");
  const problems = passwordProblems(b.password, (await getSetting("security")).minPasswordLength);
  if (problems.length) throw new ApiError(400, problems.join(" "));
  const id = await sql.begin(async (tx) => {
    const [u] = await tx`insert into users (username, full_name, email, role_id, faculty_id, is_active, password_hash)
      values (${b.username}, ${b.full_name}, ${b.email ?? null}, ${b.role_id}, ${b.faculty_id ?? null}, ${b.is_active}, ${await hashPassword(b.password!)}) returning id`;
    if (b.course_ids?.length) await tx`insert into user_course_assignments ${tx(b.course_ids.map((c) => ({ user_id: u.id, course_id: c })))}`;
    return u.id as number;
  });
  await audit(s.user.id, "USER_CREATED", "user", id, { username: b.username, role_id: b.role_id, faculty_id: b.faculty_id }, requireIp(req));
  return { id };
});
