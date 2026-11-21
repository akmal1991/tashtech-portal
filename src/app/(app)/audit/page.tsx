import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { sql } from "@/lib/db";
import { PageHeader, Badge, Empty, Pagination, Tabs, Select } from "@/components/ui";
import { AutoForm } from "@/components/auto-form";
import { fmtDateTime, flatParams, qs } from "@/lib/format";

export const metadata = { title: "Audit & History" };
const PER = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePage("audit.view");
  const sp = flatParams(await searchParams);
  const tab = sp.tab === "activity" ? "activity" : "grades";
  const page = Math.max(1, Number(sp.page) || 1);
  const users = await sql`select id, full_name from users order by full_name`;
  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : null;
  const to = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : null;
  const uid = sp.user && /^\d+$/.test(sp.user) ? Number(sp.user) : null;

  let body: React.ReactNode;
  let total = 0;
  if (tab === "grades") {
    const where = sql`where true
      ${sp.student ? sql`and (st.student_number ilike ${sp.student} or (st.last_name || ' ' || st.first_name) ilike ${"%" + sp.student + "%"})` : sql``}
      ${sp.subject ? sql`and (sub.code ilike ${sp.subject} or sub.name ilike ${"%" + sp.subject + "%"})` : sql``}
      ${uid ? sql`and h.changed_by = ${uid}` : sql``}
      ${sp.action ? sql`and h.action = ${sp.action}` : sql``}
      ${sp.approved ? sql`and h.approval_request_id is not null` : sql``}
      ${from ? sql`and h.changed_at >= ${from}::date` : sql``}
      ${to ? sql`and h.changed_at < ${to}::date + 1` : sql``}`;
    const joins = sql`from grade_history h join students st on st.id = h.student_id join courses c on c.id = h.course_id join subjects sub on sub.id = c.subject_id
      join semesters sem on sem.id = c.semester_id join assessment_types at on at.id = h.assessment_type_id
      left join users u on u.id = h.changed_by left join users a on a.id = h.approved_by`;
    [{ total }] = await sql`select count(*)::int as total ${joins} ${where}`;
    const rows = await sql`select h.*, st.student_number, st.last_name || ' ' || st.first_name as student_name, sub.code as subject_code, sub.name as subject_name,
        sem.name as semester_name, at.code, u.full_name as changed_by_name, a.full_name as approved_by_name ${joins} ${where}
      order by h.changed_at desc, h.id desc limit ${PER} offset ${(page - 1) * PER}`;
    body = rows.length === 0 ? <Empty /> : (
      <div className="scroll-x"><table className="table">
        <thead><tr><th>Date & time</th><th>Student</th><th>Subject</th><th>Assessment</th><th>Action</th><th className="text-right">Previous</th><th className="text-right">New</th><th>Changed by</th><th>Reason</th><th>Approval</th><th>IP</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}>
            <td className="whitespace-nowrap text-xs tabular">{fmtDateTime(r.changed_at)}</td>
            <td><Link className="link" href={`/students/${r.student_id}`}>{r.student_name}</Link><div className="font-mono text-xs text-muted">{r.student_number}</div></td>
            <td><Link className="link" href={`/courses/${r.course_id}`}>{r.subject_code}</Link><div className="text-xs text-muted">{r.semester_name}</div></td>
            <td>{r.code}</td><td><Badge>{r.action}</Badge></td>
            <td className="text-right tabular text-muted">{r.old_score ?? "—"}</td><td className="text-right font-semibold tabular">{r.new_score ?? "—"}</td>
            <td className="whitespace-nowrap">{r.changed_by_name ?? "System"}</td>
            <td className="max-w-56 text-xs">{r.reason ?? "—"}</td>
            <td className="text-xs">{r.approval_status ? <Badge tone="badge-green">{r.approval_status} · {r.approved_by_name}</Badge> : "—"}</td>
            <td className="font-mono text-xs text-muted">{r.ip ?? ""}</td>
          </tr>))}</tbody>
      </table></div>
    );
  } else {
    const where = sql`where true ${uid ? sql`and l.user_id = ${uid}` : sql``}
      ${sp.q ? sql`and (l.action ilike ${"%" + sp.q + "%"} or l.entity ilike ${"%" + sp.q + "%"} or l.details::text ilike ${"%" + sp.q + "%"})` : sql``}
      ${from ? sql`and l.created_at >= ${from}::date` : sql``} ${to ? sql`and l.created_at < ${to}::date + 1` : sql``}`;
    [{ total }] = await sql`select count(*)::int as total from audit_logs l ${where}`;
    const rows = await sql`select l.*, u.full_name from audit_logs l left join users u on u.id = l.user_id ${where} order by l.created_at desc, l.id desc limit ${PER} offset ${(page - 1) * PER}`;
    body = rows.length === 0 ? <Empty /> : (
      <div className="scroll-x"><table className="table">
        <thead><tr><th>Date & time</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th><th>IP</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}>
            <td className="whitespace-nowrap text-xs tabular">{fmtDateTime(r.created_at)}</td>
            <td className="whitespace-nowrap">{r.full_name ?? "System / anonymous"}</td>
            <td><span className={`badge ${/FAILED|LOCKED|DELETED|REJECTED|BLOCKED/.test(r.action) ? "badge-red" : /SENSITIVE|RESTORED|BACKUP/.test(r.action) ? "badge-amber" : "badge-gray"}`}>{r.action}</span></td>
            <td className="whitespace-nowrap text-xs">{r.entity}{r.entity_id ? ` #${r.entity_id}` : ""}</td>
            <td className="max-w-md"><code className="line-clamp-2 text-[11px] break-all text-muted" title={r.details ? JSON.stringify(r.details) : ""}>{r.details ? JSON.stringify(r.details) : ""}</code></td>
            <td className="font-mono text-xs text-muted">{r.ip ?? ""}</td>
          </tr>))}</tbody>
      </table></div>
    );
  }
  const base = { ...sp, page: undefined };
  return (
    <>
      <PageHeader title="Audit & history" subtitle="Append-only records — the database rejects any modification or deletion of history rows." />
      <Tabs active={tab} tabs={[{ key: "grades", label: "Grade history", href: "/audit" }, { key: "activity", label: "System activity log", href: "/audit?tab=activity" }]} />
      <div className="card mb-4 p-4">
        <AutoForm className="grid grid-cols-2 gap-2.5 md:grid-cols-6" keep={tab === "activity" ? [["tab", "activity"]] : []}>
          {tab === "grades" ? <>
            <input name="student" defaultValue={sp.student} className="input" placeholder="Student ID or name" />
            <input name="subject" defaultValue={sp.subject} className="input" placeholder="Subject code or name" />
            <Select name="action" value={sp.action} options={["Created", "Updated", "Deleted"].map((a) => ({ value: a, label: a }))} placeholder="Any action" />
          </> : <input name="q" defaultValue={sp.q} className="input col-span-2 md:col-span-3" placeholder="Search action, entity or details" />}
          <Select name="user" value={sp.user} options={users.map((u) => ({ value: u.id, label: u.full_name }))} placeholder="Any user" />
          <input type="date" name="from" defaultValue={from ?? ""} className="input" aria-label="From date" />
          <input type="date" name="to" defaultValue={to ?? ""} className="input" aria-label="To date" />
          {tab === "grades" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="approved" value="1" defaultChecked={!!sp.approved} />Approved changes only</label>}
          <button className="btn btn-primary">Filter</button>
        </AutoForm>
      </div>
      <div className="card overflow-hidden">
        {body}
        <Pagination page={page} pages={Math.ceil(total / PER)} total={total} href={(p) => `/audit${qs(base, { page: p })}`} />
      </div>
    </>
  );
}
