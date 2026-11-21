import "server-only";
import { gzipSync, gunzipSync } from "node:zlib";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, unlink, stat } from "node:fs/promises";
import path from "node:path";
import { sql } from "./db";
import { audit } from "./audit";
import { getSetting } from "./settings";

// Parent tables first so inserts satisfy foreign keys on restore.
export const BACKUP_TABLES = [
  "permissions", "roles", "role_permissions", "faculties", "departments", "programs", "academic_years", "semesters",
  "student_groups", "users", "students", "grading_schemes", "assessment_types", "scheme_components", "subjects", "courses",
  "user_course_assignments", "student_enrollments", "grades", "attendance", "grade_change_requests", "grade_history",
  "import_export_history", "audit_logs", "system_settings", "custom_fields", "notifications", "custom_modules",
];

export const backupDir = () => path.resolve(process.env.BACKUP_DIR || "./backups");
const key = () => Buffer.from(process.env.ENCRYPTION_KEY!, "hex");

function seal(data: Buffer) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(data), c.final()]);
  return Buffer.concat([Buffer.from("TTBK1"), iv, c.getAuthTag(), ct]);
}
function unseal(buf: Buffer) {
  if (buf.subarray(0, 5).toString() !== "TTBK1") throw new Error("Not a Tashkent Tech backup file");
  const d = createDecipheriv("aes-256-gcm", key(), buf.subarray(5, 17));
  d.setAuthTag(buf.subarray(17, 33));
  return Buffer.concat([d.update(buf.subarray(33)), d.final()]);
}

export function safeName(name: string) {
  if (!/^[\w.-]+\.ttbak$/.test(name)) throw new Error("Invalid backup file name");
  return path.join(backupDir(), name);
}

export async function createBackup(kind: "auto" | "manual" | "pre-restore", userId: number | null) {
  const data: Record<string, unknown[]> = {};
  for (const t of BACKUP_TABLES) data[t] = [...(await sql`select * from ${sql(t)}`)];
  const payload = { format: "tashtech-backup", version: 1, createdAt: new Date().toISOString(), tables: data };
  const sealed = seal(gzipSync(Buffer.from(JSON.stringify(payload))));
  await mkdir(backupDir(), { recursive: true });
  const name = `tashtech-${kind}-${new Date().toISOString().replace(/[:.]/g, "-")}.ttbak`;
  await writeFile(path.join(backupDir(), name), sealed);
  await sql`insert into backups (file_name, size_bytes, kind, created_by) values (${name}, ${sealed.length}, ${kind}, ${userId})`;
  await audit(userId, "BACKUP_CREATED", "backup", name, { kind, bytes: sealed.length });
  await prune();
  return name;
}

async function prune() {
  const { keep } = await getSetting("backup");
  const old = await sql`select id, file_name from backups where kind = 'auto' order by created_at desc offset ${keep}`;
  for (const b of old) {
    await unlink(path.join(backupDir(), b.file_name)).catch(() => {});
    await sql`delete from backups where id = ${b.id}`;
  }
}

export async function restoreBackup(name: string, userId: number, ip: string | null) {
  const buf = await readFile(safeName(name));
  const payload = JSON.parse(gunzipSync(unseal(buf)).toString("utf8"));
  if (payload.format !== "tashtech-backup") throw new Error("Unsupported backup format");
  const safety = await createBackup("pre-restore", userId);
  await sql.begin(async (tx) => {
    await tx`set local session_replication_role = replica`; // skip triggers (history must not be duplicated)
    await tx.unsafe(`truncate ${BACKUP_TABLES.join(", ")}, sessions restart identity cascade`);
    for (const t of BACKUP_TABLES) {
      const rows = (payload.tables[t] ?? []) as Record<string, unknown>[];
      for (let i = 0; i < rows.length; i += 1000) {
        const chunk = rows.slice(i, i + 1000).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v !== null && typeof v === "object" ? tx.json(v as never) : v])));
        await tx`insert into ${tx(t)} ${tx(chunk as never)}`;
      }
      const [{ has }] = await tx`select exists (select 1 from information_schema.columns where table_name = ${t} and column_name = 'id' and column_default like 'nextval%') as has`;
      if (has) await tx.unsafe(`select setval(pg_get_serial_sequence('${t}', 'id'), coalesce((select max(id) from ${t}), 0) + 1, false)`);
    }
  });
  await audit(userId, "BACKUP_RESTORED", "backup", name, { safetyBackup: safety }, ip);
  return { safety };
}

export async function backupInfo(name: string) {
  const s = await stat(safeName(name));
  return { size: s.size };
}
