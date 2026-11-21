import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { sql } from "@/lib/db";
import { PageHeader, Badge, Empty, Tabs } from "@/components/ui";
import { ApprovalButtons } from "./approval-buttons";
import { fmtDateTime, flatParams } from "@/lib/format";
import { Lock } from "lucide-react";

export const metadata = { title: "Grade Approvals" };

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requirePage(["grades.approve", "grades.enter"]);
  const sp = flatParams(await searchParams);
  const canApprove = s.permissions.has("grades.approve");
  const tab = sp.tab ?? (canApprove ? "pending" : "mine");
  const cond = tab === "pending" ? sql`r.status = 'pending'` : tab === "mine" ? sql`r.requested_by = ${s.user.id}` : sql`r.status <> 'pending'`;
  const rows = await sql`
    select r.*, at.code, at.name as type_name, st.id as student_id, st.student_number, st.last_name || ' ' || st.first_name as student_name,
           c.id as course_id, c.subject_name, c.group_name, c.semester_name, c.is_locked, u.full_name as requested_by_name, rv.full_name as reviewed_by_name,
           (select score from grades g where g.enrollment_id = r.enrollment_id and g.assessment_type_id = r.assessment_type_id) as current_score
    from grade_change_requests r
    join assessment_types at on at.id = r.assessment_type_id
    join student_enrollments e on e.id = r.enrollment_id
    join students st on st.id = e.student_id
    join v_courses c on c.id = e.course_id
    join users u on u.id = r.requested_by
    left join users rv on rv.id = r.reviewed_by
    where ${cond} ${!canApprove ? sql`and r.requested_by = ${s.user.id}` : sql``}
    order by r.requested_at desc limit 300`;
  const [{ pending }] = await sql`select count(*)::int as pending from grade_change_requests where status = 'pending'`;
  const tabs = [
    ...(canApprove ? [{ key: "pending", label: "Pending", href: "/approvals?tab=pending", count: pending }] : []),
    { key: "mine", label: "My requests", href: "/approvals?tab=mine" },
    ...(canApprove ? [{ key: "history", label: "Decided", href: "/approvals?tab=history" }] : []),
  ];
  return (
    <>
      <PageHeader title="Grade change approvals" subtitle="Modifications to existing marks and changes in locked semesters require a reason and administrator approval." />
      <Tabs tabs={tabs} active={tab} />
      <div className="card overflow-hidden">
        {rows.length === 0 ? <Empty>No requests</Empty> : (
          <div className="scroll-x"><table className="table">
            <thead><tr><th>Requested</th><th>Student</th><th>Course</th><th>Assessment</th><th className="text-right">Change</th><th>Reason</th><th>Status</th>{tab === "pending" && canApprove ? <th>Decision</th> : <th>Review</th>}</tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap text-xs">{fmtDateTime(r.requested_at)}<div className="text-muted">{r.requested_by_name}</div></td>
                <td><Link className="link" href={`/students/${r.student_id}`}>{r.student_name}</Link><div className="font-mono text-xs text-muted">{r.student_number}</div></td>
                <td><Link className="link" href={`/courses/${r.course_id}`}>{r.subject_name}</Link><div className="text-xs text-muted">{r.group_name} · {r.semester_name}{r.is_locked && <span className="ml-1 inline-flex items-center gap-0.5"><Lock size={10} />locked</span>}</div></td>
                <td>{r.code}</td>
                <td className="whitespace-nowrap text-right tabular"><span className="text-muted">{r.old_score ?? "—"}</span> → <b>{r.new_score ?? "delete"}</b>
                  {r.status === "pending" && r.current_score !== r.old_score && <div className="text-xs text-warn">current: {r.current_score ?? "—"}</div>}</td>
                <td className="max-w-xs text-xs">{r.reason}</td>
                <td><Badge>{r.status}</Badge></td>
                <td className="text-xs">{tab === "pending" && canApprove
                  ? <ApprovalButtons id={r.id} own={r.requested_by === s.user.id} />
                  : r.status === "pending" && r.requested_by === s.user.id ? <ApprovalButtons id={r.id} own cancelOnly />
                  : r.reviewed_at ? <>{r.reviewed_by_name} · {fmtDateTime(r.reviewed_at)}{r.review_comment && <div className="text-muted italic">“{r.review_comment}”</div>}</> : "—"}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
