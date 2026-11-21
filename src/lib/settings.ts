import "server-only";
import { sql } from "./db";
import { SETTINGS_DEFAULTS, type SettingKey, type Settings } from "./settings-defaults";

export async function getSetting<K extends SettingKey>(key: K): Promise<Settings[K]> {
  const [row] = await sql`select value from system_settings where key = ${key}`;
  const def = SETTINGS_DEFAULTS[key];
  if (!row) return def;
  if (typeof def === "object" && !Array.isArray(def)) return { ...def, ...(row.value as object) } as Settings[K];
  return row.value as Settings[K];
}

export async function getAllSettings(): Promise<Settings> {
  const rows = await sql`select key, value from system_settings`;
  const out = structuredClone(SETTINGS_DEFAULTS) as Record<string, unknown>;
  for (const r of rows) {
    const def = out[r.key];
    out[r.key] = def && typeof def === "object" ? { ...(def as object), ...(r.value as object) } : r.value;
  }
  return out as Settings;
}

export async function setSetting(key: SettingKey, value: unknown, userId: number) {
  await sql`insert into system_settings (key, value, updated_by, updated_at) values (${key}, ${sql.json(value as never)}, ${userId}, now())
    on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`;
}
