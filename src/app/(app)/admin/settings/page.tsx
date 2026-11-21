import { requirePage } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getAllSettings } from "@/lib/settings";
import { DASHBOARD_WIDGETS } from "@/lib/settings-defaults";
import { PageHeader, Card } from "@/components/ui";
import { BackupPanel, BrandingForm, DashboardWidgets, NumberSettings, ToggleGroup } from "./settings-forms";

export const metadata = { title: "Portal Settings" };

export default async function SettingsPage() {
  const s = await requirePage(["settings.manage", "backups.manage"]);
  const st = await getAllSettings();
  const canSettings = s.permissions.has("settings.manage");
  const canBackups = s.permissions.has("backups.manage");
  const backups = canBackups ? await sql`select b.*, u.full_name from backups b left join users u on u.id = b.created_by order by b.created_at desc limit 50` : [];
  return (
    <>
      <PageHeader title="Portal settings" subtitle="Branding, approval workflow, dashboard, security policy and backups. All changes are audited." />
      <div className="grid gap-5 xl:grid-cols-2">
        {canSettings && <>
          <Card title="Branding & visual identity"><BrandingForm value={st.branding} /></Card>
          <Card title="Grade approval workflow">
            <ToggleGroup settingKey="workflow" value={st.workflow as never} items={[
              { key: "requireApprovalForChanges", label: "Modifying an existing mark requires approval", help: "Users without the “Modify marks without approval” permission submit a change request instead." },
              { key: "requireReason", label: "A reason is mandatory for modifications and deletions", help: "Recorded in the grade history for every change." },
              { key: "allowRequestsWhenLocked", label: "Allow change requests in locked semesters", help: "If off, marks in locked semesters can only be changed by users with the lock-override permission." },
              { key: "notifyOnDirectChanges", label: "Notify approvers about direct modifications", help: "Sends a notification whenever a privileged user changes an existing mark." },
            ]} />
          </Card>
          <Card title="Dashboard widgets"><DashboardWidgets all={DASHBOARD_WIDGETS.map((w) => ({ key: w.key, label: w.label }))} value={st.dashboard.widgets} /></Card>
        </>}
        {canBackups && <>
          <Card title="Security policy">
            <NumberSettings settingKey="security" value={st.security as never} fields={[
              { key: "sessionHours", label: "Session lifetime (hours)", min: 1, max: 72 }, { key: "maxFailedAttempts", label: "Failed logins before lockout", min: 3, max: 20 },
              { key: "lockoutMinutes", label: "Lockout duration (minutes)", min: 1, max: 1440 }, { key: "minPasswordLength", label: "Minimum password length", min: 8, max: 64 },
            ]} />
          </Card>
          <Card title="Automated backups">
            <NumberSettings settingKey="backup" value={st.backup as never} extraBool={{ key: "autoEnabled", label: "Enable automatic backups" }} fields={[
              { key: "intervalHours", label: "Interval (hours)", min: 1, max: 720 }, { key: "keep", label: "Automatic backups to keep", min: 1, max: 365 },
            ]} />
            <p className="mt-3 text-xs text-muted">Backups are compressed and encrypted with AES-256-GCM using the server encryption key. They can only be restored on a server holding the same key.</p>
          </Card>
          <Card title="Backups & data recovery" className="xl:col-span-2"><BackupPanel backups={[...backups] as never} canRestore={s.permissions.has("roles.manage")} /></Card>
        </>}
      </div>
    </>
  );
}
