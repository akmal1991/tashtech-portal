import { sql } from "@/lib/db";
import { route, requireIp, ApiError } from "@/lib/api";
import { audit, notifyPermission } from "@/lib/audit";
import { afterSave, cleanValues, getEntity } from "@/lib/entity-service";

type P = { entity: string; id: string };

export const PUT = route<P>(null, async (req, s, { entity, id }) => {
  const def = getEntity(entity);
  if (!s.permissions.has(def.permission)) throw new ApiError(403, "Forbidden");
  const values = cleanValues(def, await req.json());
  const [before] = await sql`select * from ${sql(def.table)} where id = ${Number(id)}`;
  if (!before) throw new ApiError(404, "Not found");
  await sql`update ${sql(def.table)} set ${sql(values as never)} where id = ${Number(id)}`;
  await afterSave(def, Number(id), values);
  const changes = Object.fromEntries(Object.entries(values).filter(([k, v]) => JSON.stringify(before[k] ?? null) !== JSON.stringify(v ?? null)).map(([k, v]) => [k, { from: before[k], to: v }]));
  let action = `${def.singular.toUpperCase().replace(/\W+/g, "_")}_UPDATED`;
  if (def.table === "semesters" && "is_locked" in changes) {
    action = values.is_locked ? "SEMESTER_LOCKED" : "SEMESTER_UNLOCKED";
    await notifyPermission("grades.enter", {
      type: "lock", title: `Semester ${values.is_locked ? "locked" : "unlocked"}: ${before.name}`,
      body: values.is_locked ? "Marks can no longer be changed directly. Submit change requests for approval." : "Marks can be edited again.",
    });
  }
  await audit(s.user.id, action, def.table, id, { changes }, requireIp(req));
  return { ok: true };
});

export const DELETE = route<P>(null, async (req, s, { entity, id }) => {
  const def = getEntity(entity);
  if (!s.permissions.has(def.permission)) throw new ApiError(403, "Forbidden");
  const [row] = await sql`delete from ${sql(def.table)} where id = ${Number(id)} returning *`;
  if (!row) throw new ApiError(404, "Not found");
  await audit(s.user.id, `${def.singular.toUpperCase().replace(/\W+/g, "_")}_DELETED`, def.table, id, { deleted: row }, requireIp(req));
  return { ok: true };
});
