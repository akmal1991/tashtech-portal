import { sql } from "@/lib/db";
import { route, requireIp, ApiError } from "@/lib/api";
import { audit, notifyPermission } from "@/lib/audit";
import { afterSave, cleanValues, getEntity } from "@/lib/entity-service";

type P = { entity: string };

// ?options=1 returns {id,label} pairs for pickers (any signed-in user); otherwise full rows (entity permission).
export const GET = route<P>(null, async (req, s, { entity }) => {
  const def = getEntity(entity);
  if (req.nextUrl.searchParams.get("options")) {
    const rows = await sql`select id, ${sql(def.display)} as label from ${sql(def.table)} order by ${sql.unsafe(def.order)}`;
    return { rows };
  }
  if (!s.permissions.has(def.permission)) throw new ApiError(403, "Forbidden");
  const rows = await sql`select * from ${sql(def.table)} order by ${sql.unsafe(def.order)}`;
  return { rows };
});

export const POST = route<P>(null, async (req, s, { entity }) => {
  const def = getEntity(entity);
  if (!s.permissions.has(def.permission)) throw new ApiError(403, "Forbidden");
  const values = cleanValues(def, await req.json());
  const [row] = await sql`insert into ${sql(def.table)} ${sql(values as never)} returning id`;
  await afterSave(def, row.id, values);
  await audit(s.user.id, `${def.singular.toUpperCase().replace(/\W+/g, "_")}_CREATED`, def.table, row.id, values, requireIp(req));
  if (def.table === "semesters" && values.is_locked)
    await notifyPermission("grades.enter", { type: "lock", title: `Semester locked: ${values.name}`, body: "Marks can no longer be changed directly." });
  return { id: row.id };
});
