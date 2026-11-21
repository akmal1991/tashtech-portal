import { requirePage } from "@/lib/auth";
import { sql } from "@/lib/db";
import { PageHeader, Card, Badge, Empty } from "@/components/ui";
import { ImportWizard } from "./import-wizard";
import { fmtDateTime, flatParams } from "@/lib/format";

export const metadata = { title: "Excel Import" };

export default async function ImportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requirePage("import.run");
  const sp = flatParams(await searchParams);
  const history = await sql`select h.id, h.entity, h.file_name, h.status, h.rows_total, h.rows_ok, h.rows_failed, h.created_at, u.full_name
    from import_export_history h left join users u on u.id = h.user_id where h.kind = 'import' and h.status <> 'preview'
    ${s.permissions.has("audit.view") ? sql`` : sql`and h.user_id = ${s.user.id}`} order by h.created_at desc limit 30`;
  const reportId = sp.report && /^\d+$/.test(sp.report) ? Number(sp.report) : null;
  const [report] = reportId ? await sql`select * from import_export_history where id = ${reportId} ${s.permissions.has("audit.view") ? sql`` : sql`and user_id = ${s.user.id}`}` : [];
  const canStudents = s.permissions.has("students.create") || s.permissions.has("students.edit");
  const canGrades = s.permissions.has("grades.enter");
  return (
    <>
      <PageHeader title="Excel import" subtitle="Upload .xlsx files. Every row is validated and shown in a preview before anything is written." />
      <ImportWizard canStudents={canStudents} canGrades={canGrades} />
      {report && (
        <Card className="mt-5" title={`Error report — ${report.file_name}`}>
          {(report.errors as { row: number; errors: string[] }[]).length === 0 ? <p className="text-sm text-muted">No errors.</p> : (
            <ul className="space-y-1 text-sm">{(report.errors as { row: number; errors: string[] }[]).map((e, i) => <li key={i}><b>Row {e.row}:</b> {e.errors.join("; ")}</li>)}</ul>
          )}
        </Card>
      )}
      <Card className="mt-5" title="Import history" pad={false}>
        {history.length === 0 ? <Empty>No imports yet</Empty> : (
          <div className="scroll-x"><table className="table">
            <thead><tr><th>Date</th><th>Type</th><th>File</th><th>User</th><th className="text-right">Rows</th><th className="text-right">Imported</th><th className="text-right">Failed</th><th>Status</th><th /></tr></thead>
            <tbody>{history.map((h) => (
              <tr key={h.id}><td className="whitespace-nowrap text-xs">{fmtDateTime(h.created_at)}</td><td className="capitalize">{h.entity}</td><td className="max-w-56 truncate">{h.file_name}</td>
                <td>{h.full_name}</td><td className="text-right tabular">{h.rows_total}</td><td className="text-right tabular text-ok">{h.rows_ok}</td><td className="text-right tabular text-bad">{h.rows_failed}</td>
                <td><Badge tone={h.status === "completed" ? "badge-green" : h.status === "failed" ? "badge-red" : "badge-gray"}>{h.status}</Badge></td>
                <td>{h.rows_failed > 0 && <a className="link text-xs" href={`/import?report=${h.id}`}>Errors</a>}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </>
  );
}
