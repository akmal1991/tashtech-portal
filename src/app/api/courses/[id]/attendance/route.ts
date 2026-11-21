import { z } from "zod";
import { sql } from "@/lib/db";
import { route, requireIp, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getAccessibleCourse, recomputeEnrollment } from "@/lib/academic";

type P = { id: string };

export const GET = route<P>(["attendance.manage", "grades.view"], async (req, s, { id }) => {
  const c = await getAccessibleCourse(s, Number(id));
  const date = req.nextUrl.searchParams.get("date");
  const rows = date
    ? await sql`select a.enrollment_id, a.status from attendance a join student_enrollments e on e.id = a.enrollment_id where e.course_id = ${c.id} and a.session_date = ${date}`
    : [];
  const dates = await sql`select distinct a.session_date from attendance a join student_enrollments e on e.id = a.enrollment_id where e.course_id = ${c.id} order by 1 desc`;
  return { records: rows, dates: dates.map((d) => d.session_date) };
});

export const POST = route<P>("attendance.manage", async (req, s, { id }) => {
  const c = await getAccessibleCourse(s, Number(id));
  if (c.is_locked && !s.permissions.has("grades.override_lock")) throw new ApiError(403, "Semester is locked");
  const b = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    records: z.array(z.object({ enrollmentId: z.number().int(), status: z.enum(["present", "absent", "late", "excused"]) })),
  }).parse(await req.json());
  const valid = new Set((await sql`select id from student_enrollments where course_id = ${c.id}`).map((r) => r.id as number));
  const rows = b.records.filter((r) => valid.has(r.enrollmentId));
  await sql.begin(async (tx) => {
    for (const r of rows) {
      await tx`insert into attendance (enrollment_id, session_date, status, recorded_by) values (${r.enrollmentId}, ${b.date}, ${r.status}, ${s.user.id})
        on conflict (enrollment_id, session_date) do update set status = excluded.status, recorded_by = excluded.recorded_by, recorded_at = now()`;
      await recomputeEnrollment(r.enrollmentId, tx);
    }
  });
  await audit(s.user.id, "ATTENDANCE_RECORDED", "course", c.id, { date: b.date, count: rows.length }, requireIp(req));
  return { saved: rows.length };
});
