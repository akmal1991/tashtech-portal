import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { sql } from "@/lib/db";
import { mask, decrypt } from "@/lib/crypto";
import { studentScope } from "@/lib/academic";
import { studentHistory } from "@/lib/reports";
import { PageHeader, Card, Badge, ResultBadge, Empty } from "@/components/ui";
import { SensitiveReveal, StudentActions } from "./student-client";
import { fmtDate, fmtDateTime, num } from "@/lib/format";
import { FileText, LineChart, Pencil, Lock } from "lucide-react";

export default async function StudentProfile({ params }: { params: Promise<{ id: string }> }) {
  const s = await requirePage("students.view");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [st] = await sql`select s.* from v_students s where s.id = ${id} ${studentScope(s)}`;
  if (!st) notFound();
  const canGrades = s.permissions.has("grades.view");
  const h = canGrades ? await studentHistory(id) : null;
  const custom = await sql`select field_key, label, field_type from custom_fields where entity = 'student' and is_active order by sort_order`;
  const history = s.permissions.has("audit.view") ? await sql`
    select h.*, at.code, sub.name as subject_name, u.full_name as changed_by_name, a.full_name as approved_by_name
    from grade_history h join assessment_types at on at.id = h.assessment_type_id
    join courses c on c.id = h.course_id join subjects sub on sub.id = c.subject_id
    left join users u on u.id = h.changed_by left join users a on a.id = h.approved_by
    where h.student_id = ${id} order by h.changed_at desc, h.id desc limit 200` : [];
  const typeOrder = ["P1", "P2", "CW", "MID", "FINAL", "RETAKE"];
  const canSens = s.permissions.has("students.view_sensitive");

  const info: [string, React.ReactNode][] = [
    ["Student ID", <span key="i" className="font-mono">{st.student_number}</span>],
    ["Date of birth", fmtDate(st.date_of_birth)], ["Gender", st.gender ?? "—"],
    ["Passport", canSens ? <SensitiveReveal key="p" studentId={id} field="passport" masked={mask(decrypt(st.passport_enc))} /> : <span className="inline-flex items-center gap-1 text-muted"><Lock size={12} />Restricted</span>],
    ["JSHSHIR", canSens ? <SensitiveReveal key="j" studentId={id} field="jshshir" masked={mask(decrypt(st.jshshir_enc))} /> : <span className="inline-flex items-center gap-1 text-muted"><Lock size={12} />Restricted</span>],
    ["Phone", st.phone ?? "—"], ["Email", st.email ?? "—"], ["Address", st.address ?? "—"],
  ];
  const academic: [string, React.ReactNode][] = [
    ["Faculty", st.faculty_name ?? "—"], ["Department", st.department_name ?? "—"], ["Program", `${st.program_name ?? "—"} (${st.degree_level ?? "—"})`],
    ["Group", st.group_name ?? "—"], ["Year / Semester", `${st.current_year ?? "—"} / ${st.current_semester ?? "—"}`], ["Study mode", st.study_mode],
    ["Enrollment date", fmtDate(st.enrollment_date)], ["Status", <Badge key="s">{st.status}</Badge>],
  ];
  const extra: [string, React.ReactNode][] = [
    ...custom.map((c) => [c.label, c.field_type === "checkbox" ? (st.custom_data?.[c.field_key] ? "Yes" : "No") : String(st.custom_data?.[c.field_key] ?? "—")] as [string, React.ReactNode]),
  ];
  const Dl = ({ items }: { items: [string, React.ReactNode][] }) => (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-xs text-muted">{k}</dt><dd className="mt-0.5 font-medium [overflow-wrap:anywhere]">{v}</dd></div>)}
    </dl>
  );

  return (
    <>
      <PageHeader
        back={{ href: "/students", label: "Students" }}
        title={<span className="flex flex-wrap items-center gap-2">{st.last_name} {st.first_name} {st.middle_name}{st.deleted_at && <Badge tone="badge-red">Archived</Badge>}</span>}
        subtitle={`${st.student_number} · ${st.group_name ?? "No group"} · ${st.program_name}`}
        actions={<>
          {canGrades && (s.permissions.has("export.run") || s.permissions.has("reports.view")) && <>
            <a className="btn" href={`/api/pdf/transcript/${id}`} target="_blank"><FileText size={16} />Transcript</a>
            <a className="btn" href={`/api/pdf/performance/${id}`} target="_blank"><LineChart size={16} />Performance report</a>
          </>}
          {s.permissions.has("students.edit") && !st.deleted_at && <Link className="btn btn-primary" href={`/students/${id}/edit`}><Pencil size={16} />Edit</Link>}
          {s.permissions.has("students.delete") && <StudentActions id={id} studentNumber={st.student_number} archived={!!st.deleted_at} />}
        </>}
      />
      {h && (
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
          {[["Cumulative GPA", h.totals.gpa?.toFixed(2) ?? "—"], ["ECTS earned", h.totals.ectsEarned], ["Passed / Failed", `${h.totals.passed} / ${h.totals.failed}`],
            ["Retakes required", h.totals.retakes], ["Avg attendance", h.totals.attendance != null ? `${h.totals.attendance}%` : "—"]].map(([k, v]) => (
            <div key={k as string} className="card card-pad"><div className="text-xs text-muted">{k}</div><div className="kpi-value mt-1 tabular">{v}</div></div>
          ))}
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Personal information"><Dl items={info} /></Card>
        <Card title="Academic information"><Dl items={academic} />{st.notes && <p className="mt-4 rounded-lg bg-surface-2 p-3 text-sm"><span className="text-xs text-muted">Notes: </span>{st.notes}</p>}</Card>
        {extra.length > 0 && <Card title="Additional information" className="lg:col-span-2"><dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          {extra.map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-xs text-muted">{k}</dt><dd className="mt-0.5 font-medium [overflow-wrap:anywhere]">{v}</dd></div>)}
        </dl></Card>}
      </div>
      {h && (
        <div className="mt-5 space-y-5">
          <h2 className="text-lg font-semibold">Academic history</h2>
          {h.semesters.length === 0 && <Card><Empty>No course enrollments yet</Empty></Card>}
          {[...h.semesters].reverse().map((sem) => (
            <Card key={sem.id} pad={false} title={<span className="flex items-center gap-2">{sem.name}{sem.locked && <Badge tone="badge-gray"><Lock size={11} />Locked</Badge>}</span>}
              actions={<span className="text-xs text-muted">GPA <b className="text-fg">{sem.gpa?.toFixed(2) ?? "—"}</b> · ECTS {sem.earned}/{sem.ects}</span>}>
              <div className="scroll-x">
                <table className="table">
                  <thead><tr><th>Subject</th>{typeOrder.map((t) => <th key={t} className="text-right">{t}</th>)}<th className="text-right">Att.</th><th className="text-right">Total</th><th>Letter</th><th>Result</th></tr></thead>
                  <tbody>{sem.courses.map((c) => (
                    <tr key={c.enrollment_id}>
                      <td><Link href={`/courses/${c.course_id}`} className="link">{c.subject_name}</Link><div className="text-xs text-muted">{c.subject_code} · {c.ects} ECTS · {c.instructor}</div>
                        {c.instructor_comment && <div className="mt-1 text-xs italic text-muted">“{c.instructor_comment}”</div>}</td>
                      {typeOrder.map((t) => <td key={t} className="text-right tabular">{c.marks[t] ?? <span className="text-muted/50">·</span>}</td>)}
                      <td className="text-right tabular">{c.attendance_pct != null ? `${num(c.attendance_pct, 0)}%` : "—"}</td>
                      <td className="text-right font-semibold tabular">{num(c.final_score)}</td>
                      <td className="font-semibold">{c.letter_grade ?? "—"}</td>
                      <td><ResultBadge status={c.result_status} retake={c.needs_retake} /></td>
                    </tr>))}</tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}
      {s.permissions.has("audit.view") && (
        <Card className="mt-5" pad={false} title="Grade change history (audit trail)" actions={<Link className="text-xs link" href={`/audit?student=${encodeURIComponent(st.student_number)}`}>Open in audit log</Link>}>
          {history.length === 0 ? <Empty>No grade changes recorded</Empty> : (
            <div className="scroll-x max-h-[480px] overflow-y-auto">
              <table className="table">
                <thead><tr><th>When</th><th>Subject</th><th>Assessment</th><th>Action</th><th className="text-right">Old</th><th className="text-right">New</th><th>By</th><th>Reason</th><th>Approval</th></tr></thead>
                <tbody>{history.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap text-xs">{fmtDateTime(r.changed_at)}</td>
                    <td>{r.subject_name}</td><td>{r.code}</td><td><Badge>{r.action}</Badge></td>
                    <td className="text-right tabular text-muted">{r.old_score ?? "—"}</td><td className="text-right font-semibold tabular">{r.new_score ?? "—"}</td>
                    <td className="whitespace-nowrap">{r.changed_by_name ?? "System"}</td>
                    <td className="max-w-xs text-xs">{r.reason ?? "—"}</td>
                    <td className="text-xs">{r.approval_status ? <Badge tone="badge-green">{r.approval_status} by {r.approved_by_name}</Badge> : "—"}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
