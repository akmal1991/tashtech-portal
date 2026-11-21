import { z } from "zod";
import { sql } from "@/lib/db";
import { route, requireIp, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getAccessibleCourse } from "@/lib/academic";

type P = { id: string };

async function load(id: number) {
  const [e] = await sql`select e.*, c.is_locked from student_enrollments e join v_courses c on c.id = e.course_id where e.id = ${id}`;
  if (!e) throw new ApiError(404, "Enrollment not found");
  return e;
}

// Instructor comment / enrollment status
export const PUT = route<P>("grades.enter", async (req, s, { id }) => {
  const e = await load(Number(id));
  await getAccessibleCourse(s, e.course_id);
  const body = z.object({ comment: z.string().max(1000).nullable().optional(), status: z.enum(["Enrolled", "Withdrawn"]).optional() }).parse(await req.json());
  if (e.is_locked && !s.permissions.has("grades.override_lock")) throw new ApiError(403, "Semester is locked");
  if (body.status && !s.permissions.has("courses.manage")) throw new ApiError(403, "Only course managers can change enrollment status");
  await sql`update student_enrollments set instructor_comment = ${body.comment === undefined ? e.instructor_comment : body.comment},
    status = ${body.status ?? e.status} where id = ${e.id}`;
  await audit(s.user.id, "ENROLLMENT_UPDATED", "enrollment", e.id, { comment: body.comment, status: body.status }, requireIp(req));
  return { ok: true };
});

// Remove an enrollment — only possible when no marks were ever recorded.
export const DELETE = route<P>("courses.manage", async (req, s, { id }) => {
  const e = await load(Number(id));
  await getAccessibleCourse(s, e.course_id);
  const [{ n }] = await sql`select count(*)::int as n from grade_history where enrollment_id = ${e.id}`;
  if (n > 0) throw new ApiError(409, "Marks have been recorded for this enrollment; set its status to Withdrawn instead");
  await sql`delete from attendance where enrollment_id = ${e.id}`;
  await sql`delete from student_enrollments where id = ${e.id}`;
  await audit(s.user.id, "ENROLLMENT_DELETED", "enrollment", e.id, { student_id: e.student_id, course_id: e.course_id }, requireIp(req));
  return { ok: true };
});
