import "server-only";
import { sql } from "./db";
import { ApiError } from "./api";
import { ENTITIES, isEntityKey, type EntityDef, type EntityKey } from "./entities";

export function getEntity(key: string): EntityDef & { key: EntityKey } {
  if (!isEntityKey(key)) throw new ApiError(404, "Unknown entity");
  return { ...(ENTITIES[key] as EntityDef), key };
}

/** Coerce and whitelist incoming values according to the field config. */
export function cleanValues(def: EntityDef, body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const f of def.fields) {
    let v = body[f.name];
    if (v === undefined) continue;
    if (v === "") v = null;
    if (v != null) {
      if (f.type === "number" || f.type === "ref") { v = Number(v); if (Number.isNaN(v)) throw new ApiError(400, `${f.label} must be a number`); }
      else if (f.type === "boolean") v = v === true || v === "true";
      else if (f.type === "select" && f.options && !f.options.includes(String(v))) throw new ApiError(400, `${f.label}: invalid option`);
      else v = String(v).trim().slice(0, f.type === "textarea" ? 20000 : 300);
    }
    if (f.type === "boolean" && v == null) v = false;
    if (f.required && (v == null || v === "")) throw new ApiError(400, `${f.label} is required`);
    out[f.name] = v;
  }
  if (def.table === "custom_fields" && out.field_key) {
    if (!/^[a-z][a-z0-9_]{1,40}$/.test(String(out.field_key))) throw new ApiError(400, "Key must be lower-case letters, digits or _");
  }
  if (def.table === "custom_modules" && out.slug) {
    if (!/^[a-z0-9-]{2,40}$/.test(String(out.slug))) throw new ApiError(400, "Slug must be lower-case letters, digits or -");
    if (out.link_url && !/^https?:\/\//.test(String(out.link_url))) throw new ApiError(400, "Link must start with http:// or https://");
  }
  return out;
}

/** Side-effects that keep single-current flags consistent, and lock timestamps. */
export async function afterSave(def: EntityDef, id: number, values: Record<string, unknown>) {
  if (def.table === "academic_years" && values.is_current) await sql`update academic_years set is_current = false where id <> ${id}`;
  if (def.table === "semesters") {
    if (values.is_current) await sql`update semesters set is_current = false where id <> ${id}`;
    if ("is_locked" in values) await sql`update semesters set locked_at = case when is_locked then coalesce(locked_at, now()) else null end where id = ${id}`;
  }
}
