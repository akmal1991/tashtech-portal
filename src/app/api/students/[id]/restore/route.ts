import { sql } from "@/lib/db";
import { route, requireIp, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";

export const POST = route<{ id: string }>("students.delete", async (req, s, { id }) => {
  const [st] = await sql`update students set deleted_at = null, updated_at = now() where id = ${Number(id)} and deleted_at is not null returning student_number`;
  if (!st) throw new ApiError(404, "No archived student with this id");
  await audit(s.user.id, "STUDENT_RESTORED", "student", id, { student_number: st.student_number }, requireIp(req));
  return { ok: true };
});
