import { sql } from "@/lib/db";
import { route, requireIp, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { decrypt } from "@/lib/crypto";
import { assertStudentAccess } from "@/lib/academic";

// Reveals decrypted passport / JSHSHIR. Every access is written to the audit log.
export const GET = route<{ id: string }>("students.view_sensitive", async (req, s, { id }) => {
  const sid = Number(id);
  await assertStudentAccess(s, sid);
  const [st] = await sql`select passport_enc, jshshir_enc, student_number from students where id = ${sid}`;
  if (!st) throw new ApiError(404, "Student not found");
  await audit(s.user.id, "SENSITIVE_DATA_VIEWED", "student", sid, { student_number: st.student_number }, requireIp(req));
  return { passport: decrypt(st.passport_enc), jshshir: decrypt(st.jshshir_enc) };
});
