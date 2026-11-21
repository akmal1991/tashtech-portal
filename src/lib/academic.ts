import "server-only";
import { sql, type Tx } from "./db";
import { computeResult, type Scheme } from "./grading";
import { ApiError } from "./api";
import type { Session } from "./auth";

export async function loadScheme(schemeId: number, tx: Tx = sql): Promise<Scheme> {
  const [s] = await tx`select * from grading_schemes where id = ${schemeId}`;
  if (!s) throw new ApiError(404, "Grading scheme not found");
  const comps = await tx`
    select sc.assessment_type_id, sc.weight, sc.max_score, sc.min_score, at.code, at.name, at.replaces_type_id
    from scheme_components sc join assessment_types at on at.id = sc.assessment_type_id
    where sc.scheme_id = ${schemeId} order by at.sort_order, at.id`;
  return {
    id: s.id, name: s.name, passMark: s.pass_mark, minAttendance: s.min_attendance, retakeCap: s.retake_cap, scale: s.scale,
    components: comps.map((c) => ({
      assessmentTypeId: c.assessment_type_id, code: c.code, name: c.name, weight: c.weight,
      maxScore: c.max_score, minScore: c.min_score, replacesTypeId: c.replaces_type_id,
    })),
  };
}

/** Recalculate the stored result of one enrollment from its current marks and attendance. */
export async function recomputeEnrollment(enrollmentId: number, tx: Tx = sql, schemeCache?: Map<number, Scheme>) {
  const [e] = await tx`select e.id, e.attendance_pct, c.grading_scheme_id from student_enrollments e join courses c on c.id = e.course_id where e.id = ${enrollmentId}`;
  if (!e) return;
  let scheme = schemeCache?.get(e.grading_scheme_id);
  if (!scheme) { scheme = await loadScheme(e.grading_scheme_id, tx); schemeCache?.set(scheme.id, scheme); }
  const marks = await tx`select assessment_type_id, score from grades where enrollment_id = ${enrollmentId}`;
  const [att] = await tx`select round(100.0 * count(*) filter (where status in ('present','late')) / nullif(count(*) filter (where status <> 'excused'), 0), 2) as pct,
    count(*)::int as n from attendance where enrollment_id = ${enrollmentId}`;
  const attendance = att.n > 0 ? att.pct : e.attendance_pct;
  const r = computeResult(scheme, Object.fromEntries(marks.map((m) => [m.assessment_type_id, m.score])), attendance);
  await tx`update student_enrollments set final_score = ${r.total}, letter_grade = ${r.letter}, grade_point = ${r.points},
    result_status = ${r.status}, needs_retake = ${r.needsRetake}, attendance_pct = ${attendance}, computed_at = now() where id = ${enrollmentId}`;
  return r;
}

export async function recomputeCourse(courseId: number, tx: Tx = sql) {
  const cache = new Map<number, Scheme>();
  const rows = await tx`select id from student_enrollments where course_id = ${courseId}`;
  for (const r of rows) await recomputeEnrollment(r.id, tx, cache);
  return rows.length;
}

/** SQL fragment restricting v_courses (alias c) to what the session may access. */
export function courseScope(s: Session) {
  const fac = s.user.facultyId;
  if (s.permissions.has("grades.all_courses")) return fac ? sql`and c.faculty_id = ${fac}` : sql``;
  return sql`and exists (select 1 from user_course_assignments uca where uca.course_id = c.id and uca.user_id = ${s.user.id})`;
}

/** SQL fragment restricting v_students (alias s) by the user's faculty scope. */
export function studentScope(s: Session) {
  return s.user.facultyId ? sql`and s.faculty_id = ${s.user.facultyId}` : sql``;
}

export async function getAccessibleCourse(s: Session, courseId: number, tx: Tx = sql) {
  const [c] = await tx`select c.* from v_courses c where c.id = ${courseId} ${courseScope(s)}`;
  if (!c) throw new ApiError(404, "Course not found or not assigned to you");
  return c;
}

export async function assertStudentAccess(s: Session, studentId: number) {
  const [row] = await sql`select s.id from v_students s where s.id = ${studentId} ${studentScope(s)}`;
  if (!row) throw new ApiError(404, "Student not found");
}
