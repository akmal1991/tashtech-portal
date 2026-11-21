import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { sql } from "@/lib/db";
import { courseScope, loadScheme } from "@/lib/academic";
import { getSetting } from "@/lib/settings";
import { PageHeader, Badge } from "@/components/ui";
import { GradeSheet } from "./grade-sheet";
import { CourseActions } from "./course-actions";
import { fmtDateTime } from "@/lib/format";
import { CalendarCheck, Download, FileText, Lock } from "lucide-react";

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requirePage("grades.view");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [c] = await sql`select c.*, u.full_name as submitted_by_name from v_courses c left join users u on u.id = c.submitted_by where c.id = ${id} ${courseScope(s)}`;
  if (!c) notFound();
  const scheme = await loadScheme(c.grading_scheme_id);
  const enrollments = await sql`select e.*, st.student_number, st.last_name, st.first_name, st.status as student_status
    from student_enrollments e join students st on st.id = e.student_id where e.course_id = ${id} order by st.last_name, st.first_name`;
  const ids = enrollments.map((e) => e.id);
  const marks = ids.length ? await sql`select enrollment_id, assessment_type_id, score from grades where enrollment_id = any(${ids})` : [];
  const pending = ids.length ? await sql`select r.id, r.enrollment_id, r.assessment_type_id, r.new_score, r.reason, u.full_name from grade_change_requests r join users u on u.id = r.requested_by
    where r.enrollment_id = any(${ids}) and r.status = 'pending'` : [];
  const workflow = await getSetting("workflow");
  const modules = await getSetting("modules");
  const assigned = s.permissions.has("courses.manage") ? await sql`select user_id from user_course_assignments where course_id = ${id}` : [];
  const operators = s.permissions.has("courses.manage") ? await sql`select u.id, u.full_name, r.name as role from users u join roles r on r.id = u.role_id
    join role_permissions rp on rp.role_id = r.id and rp.permission_code = 'grades.enter' where u.is_active order by u.full_name` : [];

  const rows = enrollments.map((e) => ({
    enrollmentId: e.id as number, studentId: e.student_id as number, number: e.student_number as string, name: `${e.last_name} ${e.first_name}`,
    withdrawn: e.status !== "Enrolled", total: e.final_score as number | null, letter: e.letter_grade as string | null, result: e.result_status as string,
    needsRetake: e.needs_retake as boolean, attendance: e.attendance_pct as number | null, comment: e.instructor_comment as string | null,
    marks: Object.fromEntries(marks.filter((m) => m.enrollment_id === e.id).map((m) => [m.assessment_type_id, m.score])) as Record<number, number | null>,
    pending: Object.fromEntries(pending.filter((p) => p.enrollment_id === e.id).map((p) => [p.assessment_type_id, { score: p.new_score, by: p.full_name, reason: p.reason }])),
  }));
  const canEnter = s.permissions.has("grades.enter");
  const canOverride = s.permissions.has("grades.override_lock");
  const done = rows.filter((r) => r.result !== "incomplete" && !r.withdrawn);
  const passed = done.filter((r) => r.result === "passed").length;

  return (
    <>
      <PageHeader
        back={{ href: "/courses", label: "Courses" }}
        title={<span className="flex flex-wrap items-center gap-2">{c.subject_name}{c.is_locked && <Badge tone="badge-gray"><Lock size={11} />Semester locked</Badge>}</span>}
        subtitle={`${c.subject_code} · Group ${c.group_name ?? "—"} · ${c.semester_name} · ${c.instructor ?? "No instructor"} · ${c.ects} ECTS`}
        actions={<>
          {modules.attendance !== false && <Link className="btn" href={`/courses/${id}/attendance`}><CalendarCheck size={16} />Attendance</Link>}
          {(s.permissions.has("export.run") || s.permissions.has("reports.view")) && <a className="btn" href={`/api/pdf/course/${id}`} target="_blank"><FileText size={16} />Grade list PDF</a>}
          {s.permissions.has("export.run") && <a className="btn" href={`/api/export/grades?course=${id}`}><Download size={16} />Excel</a>}
          <CourseActions courseId={id} canSubmit={canEnter && !c.is_locked} canRecalc={s.permissions.has("grading.manage")} canManage={s.permissions.has("courses.manage")}
            instructor={c.instructor} schemeId={c.grading_scheme_id} groupId={c.group_id} locked={c.is_locked}
            schemes={s.permissions.has("courses.manage") ? [...await sql`select id, name from grading_schemes order by name`] as never : []}
            operators={[...operators] as never} assigned={assigned.map((a) => a.user_id as number)} />
        </>}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[["Students", rows.filter((r) => !r.withdrawn).length], ["Final results", `${done.length}`], ["Average", done.length ? (done.reduce((a, r) => a + (r.total ?? 0), 0) / done.length).toFixed(1) : "—"],
          ["Pass rate", done.length ? `${Math.round((passed / done.length) * 100)}%` : "—"], ["Pending changes", pending.length]].map(([k, v]) => (
          <div key={k as string} className="card px-4 py-3"><div className="text-xs text-muted">{k}</div><div className="mt-0.5 text-xl font-semibold tabular">{v}</div></div>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span>Scheme: <b className="text-fg">{scheme.name}</b> · pass mark {scheme.passMark}</span>
        <span>{scheme.components.filter((x) => !x.replacesTypeId).map((x) => `${x.code} ${x.weight}%`).join(" · ")}</span>
        {c.submitted_at && <span>Submitted {fmtDateTime(c.submitted_at)} by {c.submitted_by_name}</span>}
      </div>
      {c.is_locked && canEnter && !canOverride && (
        <div className="mb-3 rounded-lg border border-warn/30 bg-warn/10 px-4 py-2.5 text-sm text-warn">
          This semester is locked. Any change you enter is sent to an administrator for approval and is not applied until approved.
        </div>
      )}
      <GradeSheet
        rows={rows}
        components={scheme.components.map((x) => ({ typeId: x.assessmentTypeId, code: x.code, name: x.name, max: x.maxScore, weight: x.weight, retake: x.replacesTypeId != null }))}
        canEdit={canEnter} locked={c.is_locked} canOverride={canOverride} canEditDirect={s.permissions.has("grades.edit_direct") || !workflow.requireApprovalForChanges}
        requireReason={workflow.requireReason} canManage={s.permissions.has("courses.manage")}
      />
    </>
  );
}
