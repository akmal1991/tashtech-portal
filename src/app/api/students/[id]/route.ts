import { z } from "zod";
import { sql } from "@/lib/db";
import { route, requireIp, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { StudentInput, buildStudentRow, diff } from "@/lib/students";
import { assertStudentAccess } from "@/lib/academic";

type P = { id: string };

export const PUT = route<P>("students.edit", async (req, s, { id }) => {
  const sid = Number(id);
  await assertStudentAccess(s, sid);
  const input = StudentInput.parse(await req.json());
  const [before] = await sql`select * from students where id = ${sid} and deleted_at is null`;
  if (!before) throw new ApiError(404, "Student not found");
  const row = await buildStudentRow(input, s.permissions.has("students.view_sensitive"), before.custom_data);
  row.updated_at = new Date();
  await sql`update students set ${sql(row as never)} where id = ${sid}`;
  const changes = diff(before, row);
  delete changes.updated_at;
  await audit(s.user.id, "STUDENT_UPDATED", "student", sid, { changes }, requireIp(req));
  return { ok: true };
});

// Soft delete — the record stays recoverable and all academic history is preserved.
export const DELETE = route<P>("students.delete", async (req, s, { id }) => {
  const sid = Number(id);
  await assertStudentAccess(s, sid);
  const { confirm, reason } = z.object({ confirm: z.string(), reason: z.string().trim().min(3, "Please give a reason") }).parse(await req.json());
  const [st] = await sql`select student_number, first_name, last_name from students where id = ${sid} and deleted_at is null`;
  if (!st) throw new ApiError(404, "Student not found");
  if (confirm !== st.student_number) throw new ApiError(400, "Confirmation does not match the student ID");
  await sql`update students set deleted_at = now() where id = ${sid}`;
  await audit(s.user.id, "STUDENT_DELETED", "student", sid, { student_number: st.student_number, name: `${st.last_name} ${st.first_name}`, reason }, requireIp(req));
  return { ok: true };
});
