import { sql } from "@/lib/db";
import { route, requireIp, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getAccessibleCourse, loadScheme } from "@/lib/academic";
import { createDoc, finish, heading, keyValues, pdfResponse, signatures, table, type TCol } from "@/lib/pdf";

export const GET = route<{ id: string }>(["export.run", "reports.view"], async (req, s, { id }) => {
  if (!s.permissions.has("grades.view")) throw new ApiError(403, "Forbidden");
  const c = await getAccessibleCourse(s, Number(id));
  const scheme = await loadScheme(c.grading_scheme_id);
  const rows = await sql`select e.id, e.final_score, e.letter_grade, e.result_status, e.needs_retake, e.attendance_pct, st.student_number, st.last_name, st.first_name
    from student_enrollments e join students st on st.id = e.student_id where e.course_id = ${c.id} and e.status = 'Enrolled' order by st.last_name, st.first_name`;
  const marks = rows.length ? await sql`select enrollment_id, assessment_type_id, score from grades where enrollment_id = any(${rows.map((r) => r.id)})` : [];
  const mm = new Map(marks.map((m) => [`${m.enrollment_id}:${m.assessment_type_id}`, m.score]));
  const comps = scheme.components;

  const doc = await createDoc({ title: `Grade List — ${c.subject_code} ${c.subject_name}`, subtitle: `${c.semester_name} · Group ${c.group_name ?? "—"}`, landscape: true });
  const done = rows.filter((r) => r.result_status !== "incomplete");
  const passed = rows.filter((r) => r.result_status === "passed").length;
  keyValues(doc, [
    ["Instructor", c.instructor], ["Grading scheme", scheme.name], ["Students", rows.length], ["ECTS / Credits", `${c.ects} / ${c.credits}`],
    ["Average total", done.length ? (done.reduce((a, r) => a + r.final_score, 0) / done.length).toFixed(1) : "—"],
    ["Pass rate", done.length ? `${Math.round((passed / done.length) * 100)}%` : "—"], ["Incomplete", rows.length - done.length], ["Status", c.is_locked ? "Locked" : "Open"],
  ], 4);
  heading(doc, "Results");
  const cols: TCol[] = [
    { header: "#", width: 22, align: "right" }, { header: "Student ID", width: 70 }, { header: "Student", width: 150 },
    ...comps.map((x) => ({ header: `${x.code} /${x.maxScore}`, width: 50, align: "right" as const })),
    { header: "Att. %", width: 45, align: "right" }, { header: "Total", width: 45, align: "right" }, { header: "Letter", width: 42, align: "center" }, { header: "Result", width: 70 },
  ];
  table(doc, cols, rows.map((r, i) => [
    i + 1, r.student_number, `${r.last_name} ${r.first_name}`,
    ...comps.map((x) => mm.get(`${r.id}:${x.assessmentTypeId}`) ?? ""),
    r.attendance_pct?.toFixed(0) ?? "", r.final_score?.toFixed(1) ?? "", r.letter_grade ?? "",
    r.result_status === "passed" ? "Passed" : r.result_status === "failed" ? (r.needs_retake ? "Retake" : "Failed") : "Incomplete",
  ]), { fontSize: 8, highlight: (i) => (rows[i].result_status === "failed" ? "#fdecec" : null) });

  heading(doc, "Grade distribution");
  const dist = scheme.scale.map((sc) => [sc.letter, `${sc.min}+`, rows.filter((r) => r.letter_grade === sc.letter).length]);
  table(doc, [{ header: "Letter", width: 60 }, { header: "From", width: 60 }, { header: "Students", width: 80, align: "right" }], dist);
  signatures(doc, ["Instructor", "Head of Department", "Registrar"]);
  const buf = await finish(doc, `${c.subject_code} · ${c.group_name ?? ""} · ${c.semester_name}`);
  await audit(s.user.id, "PDF_GRADE_LIST", "course", c.id, null, requireIp(req));
  return pdfResponse(buf, `grades-${c.subject_code}-${c.group_name ?? c.id}.pdf`);
});
