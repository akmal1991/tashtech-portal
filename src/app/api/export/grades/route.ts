import { sql } from "@/lib/db";
import { route, requireIp } from "@/lib/api";
import { audit } from "@/lib/audit";
import { buildWorkbook, xlsxResponse } from "@/lib/excel";
import { GRADE_COLUMNS as GC } from "@/lib/export-columns";
import type { Column } from "@/lib/excel";
const GRADE_COLUMNS = GC as readonly { key: string; header: string; default?: boolean }[];
import { courseScope } from "@/lib/academic";
import { getSetting } from "@/lib/settings";

const n = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : null);

export const GET = route(["export.run"], async (req, s) => {
  if (!s.permissions.has("grades.view")) return Response.json({ error: "Forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const f = { ay: n(sp.get("ay")), sem: n(sp.get("sem")), group: n(sp.get("group")), course: n(sp.get("course")), subject: n(sp.get("subject")), student: n(sp.get("student")), faculty: n(sp.get("faculty")) };
  const requested = sp.get("columns")?.split(",").filter(Boolean);
  const cols = GRADE_COLUMNS.filter((c) => (requested ? requested.includes(c.key) : c.default));

  const rows = await sql`
    select e.id as enrollment_id, st.student_number, st.last_name || ' ' || st.first_name || coalesce(' ' || st.middle_name, '') as student_name,
           c.group_name, c.academic_year_name as academic_year, c.semester_number as semester, c.subject_code, c.subject_name, c.credits, c.ects,
           e.attendance_pct, e.final_score, e.letter_grade, e.grade_point, e.result_status, c.instructor, e.instructor_comment
    from student_enrollments e
    join students st on st.id = e.student_id and st.deleted_at is null
    join v_courses c on c.id = e.course_id
    where true ${courseScope(s)}
      ${f.ay ? sql`and c.academic_year_id = ${f.ay}` : sql``}
      ${f.sem ? sql`and c.semester_id = ${f.sem}` : sql``}
      ${f.group ? sql`and c.group_id = ${f.group}` : sql``}
      ${f.course ? sql`and c.id = ${f.course}` : sql``}
      ${f.subject ? sql`and c.subject_id = ${f.subject}` : sql``}
      ${f.student ? sql`and e.student_id = ${f.student}` : sql``}
      ${f.faculty ? sql`and c.faculty_id = ${f.faculty}` : sql``}
    order by c.academic_year_name, c.semester_number, c.group_name, c.subject_code, st.last_name, st.first_name
    limit 100000`;

  const includeMarks = cols.some((c) => c.key === "marks");
  const types = includeMarks ? await sql`select id, code from assessment_types order by sort_order, id` : [];
  const marks = includeMarks && rows.length
    ? await sql`select enrollment_id, assessment_type_id, score from grades where enrollment_id = any(${rows.map((r) => r.enrollment_id)}) and score is not null` : [];
  const markMap = new Map(marks.map((m) => [`${m.enrollment_id}:${m.assessment_type_id}`, m.score]));
  const usedTypes = types.filter((t) => marks.some((m) => m.assessment_type_id === t.id));

  const columns: Column[] = cols.flatMap((c): Column[] => c.key === "marks" ? usedTypes.map((t) => ({ header: t.code as string, key: "m:" + t.id, width: 9 })) : [{ header: c.header, key: c.key }]);
  const data = rows.map((r) => {
    const o: Record<string, unknown> = {};
    for (const c of columns) o[c.key] = c.key.startsWith("m:") ? markMap.get(`${r.enrollment_id}:${c.key.slice(2)}`) ?? null : r[c.key];
    return o;
  });
  const { primaryColor } = await getSetting("branding");
  const buf = await buildWorkbook([{ name: "Grades", columns, rows: data }], primaryColor);
  await sql`insert into import_export_history (kind, entity, file_name, rows_total, rows_ok, user_id) values ('export', 'grades', 'grades.xlsx', ${data.length}, ${data.length}, ${s.user.id})`;
  await audit(s.user.id, "EXPORT_GRADES", "export", null, { rows: data.length, filters: f }, requireIp(req));
  return xlsxResponse(buf, `grades-${new Date().toISOString().slice(0, 10)}.xlsx`);
});
