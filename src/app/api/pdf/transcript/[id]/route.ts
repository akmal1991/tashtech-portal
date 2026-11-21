import { sql } from "@/lib/db";
import { route, requireIp, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { assertStudentAccess } from "@/lib/academic";
import { studentHistory } from "@/lib/reports";
import { createDoc, finish, heading, keyValues, pdfResponse, signatures, table } from "@/lib/pdf";
import { sha256 } from "@/lib/crypto";

export const GET = route<{ id: string }>(["export.run", "reports.view"], async (req, s, { id }) => {
  if (!s.permissions.has("grades.view")) throw new ApiError(403, "Forbidden");
  const sid = Number(id);
  await assertStudentAccess(s, sid);
  const [st] = await sql`select * from v_students where id = ${sid}`;
  if (!st) throw new ApiError(404, "Student not found");
  const h = await studentHistory(sid);
  const docNo = sha256(`${st.student_number}|${Date.now()}`).slice(0, 10).toUpperCase();

  const doc = await createDoc({ title: "Academic Transcript", subtitle: `Document No. TT-${docNo}` });
  keyValues(doc, [
    ["Full name", `${st.last_name} ${st.first_name} ${st.middle_name ?? ""}`], ["Student ID", st.student_number],
    ["Date of birth", st.date_of_birth], ["Status", st.status],
    ["Faculty", st.faculty_name], ["Study program", `${st.program_name} (${st.degree_level})`],
    ["Group", st.group_name], ["Study mode", st.study_mode],
    ["Enrollment date", st.enrollment_date], ["Cumulative GPA", h.totals.gpa?.toFixed(2) ?? "—"],
  ]);
  for (const sem of h.semesters) {
    heading(doc, `${sem.name}`);
    table(doc, [
      { header: "Code", width: 60 }, { header: "Subject", width: 210 }, { header: "ECTS", width: 40, align: "right" },
      { header: "Total", width: 45, align: "right" }, { header: "Letter", width: 45, align: "center" }, { header: "Points", width: 45, align: "right" }, { header: "Result", width: 70 },
    ], sem.courses.map((c) => [c.subject_code, c.subject_name, c.ects, c.result_status === "incomplete" ? "—" : c.final_score?.toFixed(1), c.letter_grade ?? "—",
      c.grade_point?.toFixed(1) ?? "—", c.result_status === "passed" ? (c.marks.RETAKE != null ? "Passed (retake)" : "Passed") : c.result_status === "failed" ? "Failed" : "In progress"]),
      { highlight: (i) => (sem.courses[i].result_status === "failed" ? "#fdecec" : null) });
    doc.font(doc._tt.regular).fontSize(8.5).fillColor("#333").text(`Semester GPA: ${sem.gpa?.toFixed(2) ?? "—"}    ECTS earned: ${sem.earned} / ${sem.ects}`, { align: "right" });
  }
  heading(doc, "Summary");
  keyValues(doc, [
    ["Cumulative GPA (4.0 scale)", h.totals.gpa?.toFixed(2) ?? "—"], ["ECTS earned", h.totals.ectsEarned],
    ["Courses passed", h.totals.passed], ["Courses failed", h.totals.failed],
  ], 4);
  signatures(doc, ["Registrar", "Dean of Faculty", "Date / Seal"]);
  const buf = await finish(doc, `Transcript TT-${docNo} · ${st.student_number}`);
  await audit(s.user.id, "PDF_TRANSCRIPT", "student", sid, { docNo }, requireIp(req));
  return pdfResponse(buf, `transcript-${st.student_number}.pdf`);
});
