import "server-only";
import { sql } from "./db";
import { gpa } from "./grading";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HistoryCourse = Record<string, any> & { marks: Record<string, number> };

/** Academic history for a student grouped by semester, with semester and cumulative GPA. */
export async function studentHistory(studentId: number) {
  const rows = await sql`
    select e.id as enrollment_id, e.final_score, e.letter_grade, e.grade_point, e.result_status, e.needs_retake, e.attendance_pct, e.instructor_comment, e.status,
           c.id as course_id, c.subject_code, c.subject_name, c.credits, c.ects, c.semester_id, c.semester_name, c.semester_number,
           c.academic_year_name, c.academic_year_id, c.is_locked, c.instructor, c.group_name, c.grading_scheme_id
    from student_enrollments e join v_courses c on c.id = e.course_id
    where e.student_id = ${studentId}
    order by c.academic_year_name, c.semester_number, c.subject_code`;
  const marks = rows.length ? await sql`
    select g.enrollment_id, g.assessment_type_id, g.score, at.code from grades g join assessment_types at on at.id = g.assessment_type_id
    where g.enrollment_id = any(${rows.map((r) => r.enrollment_id)}) and g.score is not null` : [];
  const markMap = new Map<number, Record<string, number>>();
  for (const m of marks) {
    const o = markMap.get(m.enrollment_id) ?? {};
    o[m.code] = m.score;
    markMap.set(m.enrollment_id, o);
  }
  const semesters: { id: number; name: string; year: string; locked: boolean; courses: typeof enriched; gpa: number | null; ects: number; earned: number }[] = [];
  const enriched: HistoryCourse[] = rows.map((r) => Object.assign({}, r, { marks: markMap.get(r.enrollment_id) ?? {} }));
  for (const r of enriched) {
    let sem = semesters.find((s) => s.id === r.semester_id);
    if (!sem) { sem = { id: r.semester_id, name: r.semester_name, year: r.academic_year_name, locked: r.is_locked, courses: [], gpa: null, ects: 0, earned: 0 }; semesters.push(sem); }
    sem.courses.push(r);
  }
  for (const s of semesters) {
    s.gpa = gpa(s.courses.map((c) => ({ points: c.grade_point, credits: c.credits, status: c.result_status })));
    s.ects = s.courses.reduce((a, c) => a + c.ects, 0);
    s.earned = s.courses.filter((c) => c.result_status === "passed").reduce((a, c) => a + c.ects, 0);
  }
  const cumulative = gpa(enriched.map((c) => ({ points: c.grade_point, credits: c.credits, status: c.result_status })));
  const totals = {
    gpa: cumulative,
    ectsEarned: semesters.reduce((a, s) => a + s.earned, 0),
    passed: enriched.filter((c) => c.result_status === "passed").length,
    failed: enriched.filter((c) => c.result_status === "failed").length,
    incomplete: enriched.filter((c) => c.result_status === "incomplete").length,
    retakes: enriched.filter((c) => c.needs_retake).length,
    attendance: (() => { const a = enriched.filter((c) => c.attendance_pct != null); return a.length ? Math.round(a.reduce((x, c) => x + c.attendance_pct, 0) / a.length) : null; })(),
  };
  return { semesters, totals, courses: enriched };
}
