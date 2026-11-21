import { sql } from "@/lib/db";
import { route, requireIp } from "@/lib/api";
import { audit, notifyPermission } from "@/lib/audit";
import { getAccessibleCourse } from "@/lib/academic";

// Operator marks a grade sheet as submitted; approvers are notified.
export const POST = route<{ id: string }>("grades.enter", async (req, s, { id }) => {
  const c = await getAccessibleCourse(s, Number(id));
  const [{ incomplete }] = await sql`select count(*) filter (where result_status = 'incomplete')::int as incomplete from student_enrollments where course_id = ${c.id} and status = 'Enrolled'`;
  await sql`update courses set submitted_at = now(), submitted_by = ${s.user.id} where id = ${c.id}`;
  await audit(s.user.id, "GRADES_SUBMITTED", "course", c.id, { incomplete }, requireIp(req));
  await notifyPermission("grades.approve", {
    type: "submission", title: `Grades submitted: ${c.subject_name}`,
    body: `${s.user.fullName} submitted the grade sheet for ${c.group_name ?? "—"} (${c.semester_name}).${incomplete ? ` ${incomplete} student(s) still have missing marks.` : ""}`,
    link: `/courses/${c.id}`,
  }, s.user.id);
  if (incomplete) await notifyPermission("grades.approve", { type: "missing", title: `Missing grades: ${c.subject_name}`, body: `${incomplete} student(s) have incomplete marks in ${c.group_name}.`, link: `/courses/${c.id}` }, s.user.id);
  return { ok: true, incomplete };
});
