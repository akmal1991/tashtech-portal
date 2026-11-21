import { sql } from "@/lib/db";
import { route, requireIp, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { courseScope } from "@/lib/academic";
import { createDoc, finish, heading, keyValues, pdfResponse, table } from "@/lib/pdf";

const n = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : null);

// Semester report (?sem=) or academic-year report (?ay=), optionally filtered by faculty / group.
export const GET = route(["reports.view"], async (req, s) => {
  if (!s.permissions.has("grades.view")) throw new ApiError(403, "Forbidden");
  const sp = req.nextUrl.searchParams;
  const sem = n(sp.get("sem")), ay = n(sp.get("ay")), faculty = n(sp.get("faculty")), group = n(sp.get("group"));
  if (!sem && !ay) throw new ApiError(400, "Choose a semester or an academic year");
  const [period] = sem ? await sql`select name from semesters where id = ${sem}` : await sql`select name from academic_years where id = ${ay}`;
  if (!period) throw new ApiError(404, "Period not found");
  const scope = sql`${courseScope(s)} ${sem ? sql`and c.semester_id = ${sem}` : sql`and c.academic_year_id = ${ay}`}
    ${faculty ? sql`and c.faculty_id = ${faculty}` : sql``} ${group ? sql`and c.group_id = ${group}` : sql``}`;

  const [tot] = await sql`select count(distinct e.student_id)::int as students, count(*)::int as results,
      count(*) filter (where e.result_status = 'passed')::int as passed, count(*) filter (where e.result_status = 'failed')::int as failed,
      count(*) filter (where e.result_status = 'incomplete')::int as incomplete, count(*) filter (where e.needs_retake)::int as retakes,
      round(avg(e.final_score) filter (where e.result_status <> 'incomplete'), 1) as avg
    from student_enrollments e join v_courses c on c.id = e.course_id where e.status = 'Enrolled' ${scope}`;
  const byGroup = await sql`select c.group_name, count(distinct e.student_id)::int as students, round(avg(e.final_score) filter (where e.result_status <> 'incomplete'), 1) as avg,
      round(100.0 * count(*) filter (where e.result_status = 'passed') / nullif(count(*) filter (where e.result_status <> 'incomplete'), 0), 0) as pass_rate,
      count(*) filter (where e.needs_retake)::int as retakes, count(*) filter (where e.result_status = 'incomplete')::int as incomplete
    from student_enrollments e join v_courses c on c.id = e.course_id where e.status = 'Enrolled' ${scope} group by c.group_name order by c.group_name`;
  const bySubject = await sql`select c.subject_code, c.subject_name, count(*)::int as students, round(avg(e.final_score) filter (where e.result_status <> 'incomplete'), 1) as avg,
      round(100.0 * count(*) filter (where e.result_status = 'passed') / nullif(count(*) filter (where e.result_status <> 'incomplete'), 0), 0) as pass_rate,
      count(*) filter (where e.letter_grade = 'A')::int as a_count, count(*) filter (where e.result_status = 'failed')::int as failed
    from student_enrollments e join v_courses c on c.id = e.course_id where e.status = 'Enrolled' ${scope} group by 1, 2 order by avg desc nulls last`;
  const top = await sql`select st.student_number, st.last_name || ' ' || st.first_name as name, c.group_name,
      round(sum(e.grade_point * c.credits) / nullif(sum(c.credits), 0), 2) as gpa, count(*)::int as courses
    from student_enrollments e join v_courses c on c.id = e.course_id join students st on st.id = e.student_id
    where e.result_status <> 'incomplete' ${scope} group by 1, 2, 3 having count(*) >= 2 order by gpa desc nulls last limit 15`;

  const doc = await createDoc({ title: `${sem ? "Semester" : "Academic Year"} Report — ${period.name}`, subtitle: [faculty ? "Faculty filter applied" : null, group ? "Group filter applied" : null].filter(Boolean).join(" · ") || "All accessible faculties" });
  keyValues(doc, [
    ["Students", tot.students], ["Course results", tot.results], ["Average total", tot.avg ?? "—"],
    ["Pass rate", tot.passed + tot.failed ? `${Math.round((tot.passed / (tot.passed + tot.failed)) * 100)}%` : "—"],
    ["Passed", tot.passed], ["Failed", tot.failed], ["Retakes required", tot.retakes], ["Incomplete", tot.incomplete],
  ], 4);
  heading(doc, "Results by group");
  table(doc, [{ header: "Group", width: 90 }, { header: "Students", width: 60, align: "right" }, { header: "Avg total", width: 70, align: "right" },
    { header: "Pass rate", width: 70, align: "right" }, { header: "Retakes", width: 60, align: "right" }, { header: "Incomplete", width: 70, align: "right" }],
    byGroup.map((g) => [g.group_name, g.students, g.avg, g.pass_rate != null ? `${g.pass_rate}%` : "—", g.retakes, g.incomplete]));
  heading(doc, "Subject performance");
  table(doc, [{ header: "Code", width: 60 }, { header: "Subject", width: 200 }, { header: "Results", width: 50, align: "right" }, { header: "Avg", width: 50, align: "right" },
    { header: "Pass rate", width: 60, align: "right" }, { header: "A grades", width: 55, align: "right" }, { header: "Failed", width: 50, align: "right" }],
    bySubject.map((r) => [r.subject_code, r.subject_name, r.students, r.avg, r.pass_rate != null ? `${r.pass_rate}%` : "—", r.a_count, r.failed]));
  if (top.length) {
    heading(doc, "Top students (GPA)");
    table(doc, [{ header: "#", width: 25, align: "right" }, { header: "Student ID", width: 80 }, { header: "Name", width: 180 }, { header: "Group", width: 80 }, { header: "GPA", width: 50, align: "right" }, { header: "Courses", width: 55, align: "right" }],
      top.map((r, i) => [i + 1, r.student_number, r.name, r.group_name, r.gpa?.toFixed(2), r.courses]));
  }
  const buf = await finish(doc, `${sem ? "Semester" : "Year"} report · ${period.name}`);
  await audit(s.user.id, "PDF_PERIOD_REPORT", "report", null, { sem, ay, faculty, group }, requireIp(req));
  return pdfResponse(buf, `report-${String(period.name).replace(/\W+/g, "-")}.pdf`);
});
