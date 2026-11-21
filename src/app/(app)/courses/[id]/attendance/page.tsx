import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { sql } from "@/lib/db";
import { courseScope } from "@/lib/academic";
import { PageHeader } from "@/components/ui";
import { AttendanceSheet } from "./attendance-sheet";

export const metadata = { title: "Attendance" };

export default async function AttendancePage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requirePage(["attendance.manage", "grades.view"]);
  const id = Number((await params).id);
  const [c] = await sql`select c.* from v_courses c where c.id = ${id} ${courseScope(s)}`;
  if (!c) notFound();
  const students = await sql`select e.id as enrollment_id, e.attendance_pct, st.student_number, st.last_name || ' ' || st.first_name as name
    from student_enrollments e join students st on st.id = e.student_id where e.course_id = ${id} and e.status = 'Enrolled' order by st.last_name, st.first_name`;
  const summary = await sql`select a.session_date, count(*) filter (where a.status in ('present','late'))::int as present, count(*)::int as total
    from attendance a join student_enrollments e on e.id = a.enrollment_id where e.course_id = ${id} group by 1 order by 1 desc`;
  return (
    <>
      <PageHeader back={{ href: `/courses/${id}`, label: c.subject_name }} title="Attendance" subtitle={`${c.subject_code} · ${c.group_name ?? ""} · ${c.semester_name}`} />
      <AttendanceSheet courseId={id} students={[...students] as never} sessions={[...summary] as never}
        canEdit={s.permissions.has("attendance.manage") && (!c.is_locked || s.permissions.has("grades.override_lock"))} />
    </>
  );
}
