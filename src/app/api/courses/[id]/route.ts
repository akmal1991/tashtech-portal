import { z } from "zod";
import { sql } from "@/lib/db";
import { route, requireIp, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getAccessibleCourse, recomputeCourse } from "@/lib/academic";

type P = { id: string };

export const PUT = route<P>("courses.manage", async (req, s, { id }) => {
  const c = await getAccessibleCourse(s, Number(id));
  const b = z.object({
    instructor: z.string().trim().max(120).nullable().optional(),
    grading_scheme_id: z.number().int().positive().optional(),
    assigned_user_ids: z.array(z.number().int()).optional(),
  }).parse(await req.json());
  if (b.grading_scheme_id && b.grading_scheme_id !== c.grading_scheme_id && c.is_locked)
    throw new ApiError(403, "Cannot change the grading scheme of a locked semester");
  await sql.begin(async (tx) => {
    await tx`update courses set instructor = ${b.instructor === undefined ? c.instructor : b.instructor},
      grading_scheme_id = ${b.grading_scheme_id ?? c.grading_scheme_id} where id = ${c.id}`;
    if (b.assigned_user_ids) {
      await tx`delete from user_course_assignments where course_id = ${c.id}`;
      if (b.assigned_user_ids.length)
        await tx`insert into user_course_assignments ${tx(b.assigned_user_ids.map((u) => ({ user_id: u, course_id: c.id })))}`;
    }
    if (b.grading_scheme_id && b.grading_scheme_id !== c.grading_scheme_id) await recomputeCourse(c.id, tx);
  });
  await audit(s.user.id, "COURSE_UPDATED", "course", c.id, b, requireIp(req));
  return { ok: true };
});

export const DELETE = route<P>("courses.manage", async (req, s, { id }) => {
  const c = await getAccessibleCourse(s, Number(id));
  const [{ n }] = await sql`select count(*)::int n from grade_history where course_id = ${c.id}`;
  if (n > 0) throw new ApiError(409, "This course has recorded marks and cannot be deleted");
  await sql.begin(async (tx) => {
    await tx`delete from attendance where enrollment_id in (select id from student_enrollments where course_id = ${c.id})`;
    await tx`delete from student_enrollments where course_id = ${c.id}`;
    await tx`delete from courses where id = ${c.id}`;
  });
  await audit(s.user.id, "COURSE_DELETED", "course", c.id, { subject: c.subject_name, semester: c.semester_name, group: c.group_name }, requireIp(req));
  return { ok: true };
});
