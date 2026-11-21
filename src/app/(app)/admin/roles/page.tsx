import { requirePage } from "@/lib/auth";
import { sql } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { RoleManager } from "./role-manager";

export const metadata = { title: "Roles & Permissions" };

export default async function RolesPage() {
  await requirePage("roles.manage");
  const roles = await sql`select r.*, (select count(*)::int from users u where u.role_id = r.id) as users,
      coalesce((select array_agg(permission_code) from role_permissions rp where rp.role_id = r.id), '{}') as permissions
    from roles r order by r.is_system desc, r.name`;
  return (
    <>
      <PageHeader title="Roles & permissions" subtitle="Create roles and choose exactly which permissions each role grants. Changes take effect immediately." />
      <RoleManager roles={[...roles] as never} />
    </>
  );
}
