import "server-only";
import { sql } from "./db";
import { ApiError } from "./api";
import { audit, notifyPermission, notifyUser } from "./audit";
import { getAccessibleCourse, recomputeEnrollment } from "./academic";
import { getSetting } from "./settings";
import type { Session } from "./auth";

export type GradeChangeInput = { enrollmentId: number; assessmentTypeId: number; score: number | null; reason?: string | null };
export type GradeChangeResult = { status: "applied" | "pending" | "unchanged"; requestId?: number; message: string };

/**
 * Applies a mark change inside a transaction. The grades trigger writes the grade_history row;
 * we pass who / why / approval context via transaction-local settings.
 */
export async function applyGradeChange(opts: {
  enrollmentId: number; assessmentTypeId: number; score: number | null; reason: string | null;
  userId: number; ip: string | null; approval?: { id: number; approvedBy: number };
}) {
  return sql.begin(async (tx) => {
    await tx`select set_config('app.user_id', ${String(opts.userId)}, true),
                    set_config('app.reason', ${opts.reason ?? ""}, true),
                    set_config('app.ip', ${opts.ip ?? ""}, true),
                    set_config('app.changed_at', '', true),
                    set_config('app.approval_id', ${opts.approval ? String(opts.approval.id) : ""}, true),
                    set_config('app.approval_status', ${opts.approval ? "Approved" : ""}, true),
                    set_config('app.approved_by', ${opts.approval ? String(opts.approval.approvedBy) : ""}, true)`;
    await tx`insert into grades (enrollment_id, assessment_type_id, score, entered_by, updated_by)
      values (${opts.enrollmentId}, ${opts.assessmentTypeId}, ${opts.score}, ${opts.userId}, ${opts.userId})
      on conflict (enrollment_id, assessment_type_id)
      do update set score = excluded.score, updated_by = excluded.updated_by, updated_at = now()`;
    return recomputeEnrollment(opts.enrollmentId, tx);
  });
}

async function loadContext(enrollmentId: number, assessmentTypeId: number) {
  const [ctx] = await sql`
    select e.id, e.student_id, e.course_id, e.status as enrollment_status, c.grading_scheme_id, c.is_locked, c.subject_name, c.semester_name,
           st.first_name, st.last_name, st.student_number,
           sc.max_score, at.name as type_name, at.code as type_code, at.replaces_type_id,
           (select score from grades g where g.enrollment_id = e.id and g.assessment_type_id = ${assessmentTypeId}) as current_score
    from student_enrollments e
    join v_courses c on c.id = e.course_id
    join students st on st.id = e.student_id
    left join scheme_components sc on sc.scheme_id = c.grading_scheme_id and sc.assessment_type_id = ${assessmentTypeId}
    join assessment_types at on at.id = ${assessmentTypeId}
    where e.id = ${enrollmentId}`;
  if (!ctx) throw new ApiError(404, "Enrollment not found");
  if (ctx.max_score == null) throw new ApiError(400, "This assessment type is not part of the course's grading scheme");
  return ctx;
}

export async function changeGrade(s: Session, input: GradeChangeInput, ip: string | null): Promise<GradeChangeResult> {
  if (!s.permissions.has("grades.enter")) throw new ApiError(403, "You are not allowed to enter marks");
  const ctx = await loadContext(input.enrollmentId, input.assessmentTypeId);
  await getAccessibleCourse(s, ctx.course_id);
  if (ctx.enrollment_status !== "Enrolled") throw new ApiError(400, "Student has withdrawn from this course");

  const score = input.score == null ? null : Math.round(input.score * 100) / 100;
  if (score != null && (Number.isNaN(score) || score < 0 || score > ctx.max_score))
    throw new ApiError(400, `${ctx.type_name} must be between 0 and ${ctx.max_score}`);
  const old: number | null = ctx.current_score;
  if (old === score) return { status: "unchanged", message: "No change" };

  const workflow = await getSetting("workflow");
  const reason = input.reason?.trim() || null;
  const isModification = old != null;
  const locked: boolean = ctx.is_locked;
  if (workflow.requireReason && (isModification || locked) && !reason)
    throw new ApiError(400, "A reason is required to modify or delete an existing mark");

  const lockOk = !locked || s.permissions.has("grades.override_lock");
  const editOk = !isModification || s.permissions.has("grades.edit_direct") || !workflow.requireApprovalForChanges;
  const label = `${ctx.last_name} ${ctx.first_name} (${ctx.student_number}) · ${ctx.subject_name} · ${ctx.type_name}`;

  if (!lockOk || !editOk) {
    if (locked && !lockOk && !workflow.allowRequestsWhenLocked)
      throw new ApiError(403, "This semester is locked. Marks can no longer be changed.");
    const [dup] = await sql`select id from grade_change_requests where enrollment_id = ${input.enrollmentId}
      and assessment_type_id = ${input.assessmentTypeId} and status = 'pending'`;
    if (dup) throw new ApiError(409, "A change request for this mark is already pending approval");
    const [req] = await sql`insert into grade_change_requests (enrollment_id, assessment_type_id, old_score, new_score, reason, requested_by)
      values (${input.enrollmentId}, ${input.assessmentTypeId}, ${old}, ${score}, ${reason ?? "Mark entry in locked semester"}, ${s.user.id}) returning id`;
    await audit(s.user.id, "GRADE_CHANGE_REQUESTED", "grade_change_request", req.id, { label, old, new: score, reason, locked }, ip);
    await notifyPermission("grades.approve", {
      type: "approval", title: "Grade change awaiting approval",
      body: `${s.user.fullName}: ${label}: ${old ?? "—"} → ${score ?? "deleted"}. Reason: ${reason}`, link: "/approvals",
    }, s.user.id);
    return { status: "pending", requestId: req.id, message: locked ? "Semester is locked — change submitted for administrator approval" : "Change submitted for approval" };
  }

  await applyGradeChange({ enrollmentId: input.enrollmentId, assessmentTypeId: input.assessmentTypeId, score, reason, userId: s.user.id, ip });
  const action = old == null ? "GRADE_CREATED" : score == null ? "GRADE_DELETED" : "GRADE_UPDATED";
  await audit(s.user.id, action, "grade", `${input.enrollmentId}:${input.assessmentTypeId}`, { label, old, new: score, reason, locked }, ip);
  if (isModification && workflow.notifyOnDirectChanges)
    await notifyPermission("grades.approve", { type: "modification", title: "Grade modified", body: `${s.user.fullName} changed ${label}: ${old} → ${score ?? "deleted"}`, link: `/students/${ctx.student_id}` }, s.user.id);
  if (ctx.replaces_type_id != null && score != null)
    await notifyPermission("grades.approve", { type: "retake", title: "Retake result recorded", body: `${label}: ${score}`, link: `/courses/${ctx.course_id}` }, s.user.id);
  return { status: "applied", message: "Saved" };
}

export async function decideRequest(s: Session, requestId: number, decision: "approved" | "rejected", comment: string | null, ip: string | null) {
  const [req] = await sql`select r.*, at.name as type_name, st.last_name, st.first_name, c.subject_name
    from grade_change_requests r
    join assessment_types at on at.id = r.assessment_type_id
    join student_enrollments e on e.id = r.enrollment_id
    join students st on st.id = e.student_id
    join v_courses c on c.id = e.course_id
    where r.id = ${requestId}`;
  if (!req) throw new ApiError(404, "Request not found");
  if (req.status !== "pending") throw new ApiError(409, `Request already ${req.status}`);
  if (req.requested_by === s.user.id && !s.permissions.has("roles.manage"))
    throw new ApiError(403, "You cannot approve your own request");
  if (decision === "rejected" && !comment) throw new ApiError(400, "Please give a reason for rejecting");

  const [updated] = await sql`update grade_change_requests set status = ${decision}, reviewed_by = ${s.user.id}, reviewed_at = now(), review_comment = ${comment}
    where id = ${requestId} and status = 'pending' returning id`;
  if (!updated) throw new ApiError(409, "Request was already processed");
  if (decision === "approved") {
    await applyGradeChange({
      enrollmentId: req.enrollment_id, assessmentTypeId: req.assessment_type_id, score: req.new_score,
      reason: req.reason, userId: req.requested_by, ip, approval: { id: req.id, approvedBy: s.user.id },
    });
  }
  const label = `${req.last_name} ${req.first_name} · ${req.subject_name} · ${req.type_name}`;
  await audit(s.user.id, decision === "approved" ? "GRADE_CHANGE_APPROVED" : "GRADE_CHANGE_REJECTED", "grade_change_request", requestId, { label, old: req.old_score, new: req.new_score, comment }, ip);
  await notifyUser(req.requested_by, {
    type: "approval", title: `Grade change ${decision}`,
    body: `${label}: ${req.old_score ?? "—"} → ${req.new_score ?? "deleted"}${comment ? ` — ${comment}` : ""}`, link: "/approvals?tab=mine",
  });
}
