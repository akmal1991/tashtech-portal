import { requirePage } from "@/lib/auth";
import { sql } from "@/lib/db";
import { PageHeader, Card } from "@/components/ui";
import { PasswordForm } from "./password-form";
import { fmtDateTime } from "@/lib/format";
import { PERMISSIONS } from "@/lib/permissions";

export const metadata = { title: "My account" };

export default async function Profile() {
  const s = await requirePage();
  const [u] = await sql`select last_login_at, password_changed_at, email from users where id = ${s.user.id}`;
  const sessions = await sql`select created_at, expires_at, ip, user_agent, id = ${s.sessionId} as current from sessions where user_id = ${s.user.id} and expires_at > now() order by created_at desc`;
  return (
    <>
      <PageHeader title="My account" subtitle={`${s.user.fullName} · ${s.user.roleName}`} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Change password"><PasswordForm /></Card>
        <Card title="Account">
          <dl className="space-y-2 text-sm">
            <div><dt className="text-xs text-muted">Username</dt><dd>{s.user.username}</dd></div>
            <div><dt className="text-xs text-muted">Email</dt><dd>{u.email ?? "—"}</dd></div>
            <div><dt className="text-xs text-muted">Data scope</dt><dd>{s.user.facultyName ?? "All faculties"}</dd></div>
            <div><dt className="text-xs text-muted">Last sign-in</dt><dd>{fmtDateTime(u.last_login_at)}</dd></div>
            <div><dt className="text-xs text-muted">Password changed</dt><dd>{fmtDateTime(u.password_changed_at)}</dd></div>
          </dl>
          <h3 className="mt-5 mb-2 text-xs font-semibold text-muted uppercase">Active sessions</h3>
          <ul className="space-y-1 text-xs">{sessions.map((x, i) => <li key={i}>{fmtDateTime(x.created_at)} · {x.ip ?? "local"} {x.current && <b>(this device)</b>}<div className="truncate text-muted">{x.user_agent}</div></li>)}</ul>
        </Card>
        <Card title="My permissions" className="lg:col-span-2">
          <ul className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {PERMISSIONS.filter((p) => s.permissions.has(p.code)).map((p) => <li key={p.code}>✓ {p.description}</li>)}
          </ul>
        </Card>
      </div>
    </>
  );
}
