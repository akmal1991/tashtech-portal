import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { sql } from "@/lib/db";
import { PageHeader, Empty, Badge } from "@/components/ui";
import { MarkAllRead } from "./mark-all";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Notifications" };
const typeLabel: Record<string, string> = { approval: "Approval", modification: "Modification", missing: "Missing grades", submission: "Submission", import: "Import", retake: "Retake", lock: "Semester lock" };

export default async function NotificationsPage() {
  const s = await requirePage();
  const rows = await sql`select * from notifications where user_id = ${s.user.id} order by created_at desc limit 200`;
  return (
    <>
      <PageHeader title="Notifications" actions={<MarkAllRead />} />
      <div className="card overflow-hidden">
        {rows.length === 0 ? <Empty>No notifications</Empty> : (
          <ul>{rows.map((n) => (
            <li key={n.id} className={`flex flex-wrap items-start gap-3 border-b border-line px-5 py-3 last:border-0 ${n.is_read ? "" : "bg-brand/5"}`}>
              <Badge tone={n.type === "approval" ? "badge-amber" : n.type === "import" ? "badge-red" : "badge-blue"}>{typeLabel[n.type] ?? n.type}</Badge>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{n.link ? <Link className="hover:underline" href={n.link}>{n.title}</Link> : n.title}</div>
                {n.body && <div className="text-sm text-muted">{n.body}</div>}
              </div>
              <div className="text-xs text-muted">{fmtDateTime(n.created_at)}</div>
            </li>))}</ul>
        )}
      </div>
    </>
  );
}
