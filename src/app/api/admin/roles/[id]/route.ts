import { sql } from "@/lib/db";
import { route, requireIp, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { RoleBody } from "@/lib/admin-schemas";

type P = { id: string };

export const PUT = route<P>("roles.manage", async (req, s, { id }) => {
  const rid = Number(id);
  const b = RoleBody.parse(await req.json());
  const [role] = await sql`select * from roles where id = ${rid}`;
  if (!role) throw new ApiError(404, "Role not found");
  if (role.name === "Administrator" && (!b.permissions.includes("roles.manage") || !b.permissions.includes("users.manage")))
    throw new ApiError(400, "The Administrator role must keep role and user management permissions");
  const before = (await sql`select permission_code from role_permissions where role_id = ${rid}`).map((r) => r.permission_code as string);
  await sql.begin(async (tx) => {
    await tx`update roles set name = ${role.is_system ? role.name : b.name}, description = ${b.description ?? null} where id = ${rid}`;
    await tx`delete from role_permissions where role_id = ${rid}`;
    if (b.permissions.length) await tx`insert into role_permissions ${tx(b.permissions.map((p) => ({ role_id: rid, permission_code: p })))}`;
  });
  await audit(s.user.id, "ROLE_UPDATED", "role", rid, {
    name: b.name, added: b.permissions.filter((p) => !before.includes(p)), removed: before.filter((p) => !b.permissions.includes(p)),
  }, requireIp(req));
  return { ok: true };
});

export const DELETE = route<P>("roles.manage", async (req, s, { id }) => {
  const [role] = await sql`select * from roles where id = ${Number(id)}`;
  if (!role) throw new ApiError(404, "Role not found");
  if (role.is_system) throw new ApiError(400, "Built-in roles cannot be deleted");
  const [{ n }] = await sql`select count(*)::int n from users where role_id = ${role.id}`;
  if (n) throw new ApiError(409, `${n} user(s) still have this role`);
  await sql`delete from roles where id = ${role.id}`;
  await audit(s.user.id, "ROLE_DELETED", "role", role.id, { name: role.name }, requireIp(req));
  return { ok: true };
});
