import { sql } from "@/lib/db";
import { route, requireIp, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { assertStudentAccess } from "@/lib/academic";
import { studentHistory } from "@/lib/reports";
import { createDoc, ensureSpace, finish, heading, keyValues, pdfResponse, table, t } from "@/lib/pdf";

export const GET = route<{ id: string }>(["reports.view", "export.run"], async (req, s, { id }) => {
  if (!s.permissions.has("grades.view")) throw new ApiError(403, "Forbidden");
  const sid = Number(id);
  await assertStudentAccess(s, sid);
  const [st] = await sql`select * from v_students where id = ${sid}`;
  if (!st) throw new ApiError(404, "Student not found");
  const h = await studentHistory(sid);
  const [rank] = await sql`with g as (
      select e.student_id, sum(e.grade_point * c.credits) / nullif(sum(c.credits), 0) as gpa
      from student_enrollments e join v_courses c on c.id = e.course_id join students x on x.id = e.student_id
      where x.group_id = ${st.group_id} and e.result_status <> 'incomplete' group by e.student_id)
    select (select count(*) + 1 from g where gpa > (select gpa from g where student_id = ${sid}))::int as position, (select count(*) from g)::int as size`;

  const doc = await createDoc({ title: "Academic Performance Report", subtitle: `${st.last_name} ${st.first_name} · ${st.student_number}` });
  keyValues(doc, [
    ["Program", `${st.program_name} (${st.degree_level})`], ["Group", st.group_name], ["Year / Semester", `${st.current_year ?? "—"} / ${st.current_semester ?? "—"}`], ["Status", st.status],
    ["Cumulative GPA", h.totals.gpa?.toFixed(2) ?? "—"], ["Rank in group", rank?.size ? `${rank.position} of ${rank.size}` : "—"],
    ["ECTS earned", h.totals.ectsEarned], ["Average attendance", h.totals.attendance != null ? `${h.totals.attendance}%` : "—"],
    ["Courses passed", h.totals.passed], ["Courses failed", h.totals.failed], ["Retakes required", h.totals.retakes], ["In progress", h.totals.incomplete],
  ], 4);

  // GPA trend bar chart
  heading(doc, "GPA by semester");
  ensureSpace(doc, 150);
  const left = doc.page.margins.left, chartH = 110, top = doc.y + 5;
  const width = doc.page.width - left - doc.page.margins.right;
  const sems = h.semesters.filter((x) => x.gpa != null);
  const bw = Math.min(60, width / Math.max(1, sems.length) - 14);
  doc.moveTo(left, top + chartH).lineTo(left + width, top + chartH).strokeColor("#bbb").lineWidth(0.6).stroke();
  for (const v of [1, 2, 3, 4]) {
    const y = top + chartH - (v / 4) * chartH;
    doc.moveTo(left, y).lineTo(left + width, y).strokeColor("#eee").stroke();
    doc.fillColor("#999").fontSize(7).text(v.toFixed(1), left, y - 3, { width: 16, lineBreak: false });
  }
  sems.forEach((x, i) => {
    const bh = ((x.gpa as number) / 4) * chartH;
    const bx = left + 20 + i * (bw + 14);
    doc.save().rect(bx, top + chartH - bh, bw, bh).fill(doc._tt.brand).restore();
    doc.fillColor("#111").font(doc._tt.bold).fontSize(8).text((x.gpa as number).toFixed(2), bx, top + chartH - bh - 11, { width: bw, align: "center" });
    doc.fillColor("#555").font(doc._tt.regular).fontSize(6.5).text(t(doc, x.name.replace(" · Semester ", " S")), bx - 4, top + chartH + 4, { width: bw + 8, align: "center" });
  });
  doc.y = top + chartH + 26; doc.x = left;

  const done = h.courses.filter((c) => c.result_status !== "incomplete");
  const best = [...done].sort((a, b) => b.final_score - a.final_score).slice(0, 5);
  const weak = [...done].sort((a, b) => a.final_score - b.final_score).slice(0, 5);
  heading(doc, "Strongest subjects");
  table(doc, [{ header: "Subject", width: 260 }, { header: "Semester", width: 140 }, { header: "Total", width: 50, align: "right" }, { header: "Letter", width: 50, align: "center" }],
    best.map((c) => [c.subject_name, c.semester_name, c.final_score?.toFixed(1), c.letter_grade]));
  heading(doc, "Subjects needing attention");
  table(doc, [{ header: "Subject", width: 260 }, { header: "Semester", width: 140 }, { header: "Total", width: 50, align: "right" }, { header: "Letter", width: 50, align: "center" }],
    weak.map((c) => [c.subject_name, c.semester_name, c.final_score?.toFixed(1), c.letter_grade]), { highlight: (i) => (weak[i].result_status === "failed" ? "#fdecec" : null) });
  const current = h.courses.filter((c) => c.result_status === "incomplete");
  if (current.length) {
    heading(doc, "Current semester (in progress)");
    table(doc, [{ header: "Subject", width: 220 }, { header: "Marks so far", width: 200 }, { header: "Partial total", width: 70, align: "right" }, { header: "Att. %", width: 50, align: "right" }],
      current.map((c) => [c.subject_name, Object.entries(c.marks).map(([k, v]) => `${k}: ${v}`).join("  "), c.final_score?.toFixed(1), c.attendance_pct?.toFixed(0)]));
  }
  const buf = await finish(doc, `Performance report · ${st.student_number}`);
  await audit(s.user.id, "PDF_PERFORMANCE_REPORT", "student", sid, null, requireIp(req));
  return pdfResponse(buf, `performance-${st.student_number}.pdf`);
});
