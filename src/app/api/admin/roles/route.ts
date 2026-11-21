import { RoleBody } from "@/lib/admin-schemas";
import { z } from "zod";
import { sql } from "@/lib/db";
import { route, requireIp } from "@/lib/api";
import { audit } from "@/lib/audit";
import { ALL_PERMISSIONS } from "@/lib/permissions";

export const POST = route("roles.manage", async (req, s) => {
  const b = RoleBody.parse(await req.json());
  const id = await sql.begin(async (tx) => {
    const [r] = await tx`insert into roles (name, description) values (${b.name}, ${b.description ?? null}) returning id`;
    if (b.permissions.length) await tx`insert into role_permissions ${tx(b.permissions.map((p) => ({ role_id: r.id, permission_code: p })))}`;
    return r.id as number;
  });
  await audit(s.user.id, "ROLE_CREATED", "role", id, b, requireIp(req));
  return { id };
});
