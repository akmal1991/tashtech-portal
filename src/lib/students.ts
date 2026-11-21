import "server-only";
import { z } from "zod";
import { sql } from "./db";
import { ApiError } from "./api";
import { blindIndex, encrypt, normalizeId } from "./crypto";

const opt = (s: z.ZodTypeAny) => z.preprocess((v) => (v === "" ? null : v), s.nullable().optional());

export const StudentInput = z.object({
  student_number: z.string().trim().min(3).max(30),
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  middle_name: opt(z.string().trim().max(80)),
  passport: z.string().trim().optional(),
  jshshir: z.string().trim().optional(),
  date_of_birth: opt(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD")),
  gender: opt(z.enum(["Male", "Female"])),
  program_id: z.coerce.number().int().positive(),
  group_id: opt(z.coerce.number().int().positive()),
  current_year: opt(z.coerce.number().int().min(1).max(8)),
  current_semester: opt(z.coerce.number().int().min(1).max(16)),
  study_mode: z.enum(["Full-time", "Part-time"]).default("Full-time"),
  status: z.enum(["Active", "Graduated", "Suspended", "Withdrawn"]).default("Active"),
  enrollment_date: opt(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD")),
  phone: opt(z.string().trim().max(40)),
  email: opt(z.string().trim().email().max(120)),
  address: opt(z.string().trim().max(300)),
  notes: opt(z.string().trim().max(2000)),
  custom_data: z.record(z.string(), z.unknown()).optional(),
});
export type StudentInputT = z.infer<typeof StudentInput>;

export function validatePassport(v: string) {
  return /^[A-Z]{2}\d{7}$/.test(normalizeId(v));
}
export function validateJshshir(v: string) {
  return /^\d{14}$/.test(normalizeId(v));
}

async function validateCustom(data: Record<string, unknown> | undefined) {
  const fields = await sql`select field_key, label, field_type, options, is_required from custom_fields where entity = 'student' and is_active`;
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    let v = data?.[f.field_key];
    if (v === "" || v === undefined) v = null;
    if (v == null) {
      if (f.is_required) throw new ApiError(400, `${f.label} is required`);
      continue;
    }
    if (f.field_type === "number") { v = Number(v); if (Number.isNaN(v)) throw new ApiError(400, `${f.label} must be a number`); }
    if (f.field_type === "checkbox") v = v === true || v === "true" || v === "1" || v === "Yes";
    if (f.field_type === "select" && f.options && !String(f.options).split(",").map((o: string) => o.trim()).includes(String(v)))
      throw new ApiError(400, `${f.label}: "${v}" is not an allowed option`);
    out[f.field_key] = v;
  }
  return out;
}

/** Build the DB row from validated input. `canSensitive` gates passport/JSHSHIR writes. */
export async function buildStudentRow(input: StudentInputT, canSensitive: boolean, existingCustom?: Record<string, unknown>) {
  const [prog] = await sql`select id from programs where id = ${input.program_id}`;
  if (!prog) throw new ApiError(400, "Unknown study program");
  if (input.group_id) {
    const [g] = await sql`select program_id from student_groups where id = ${Number(input.group_id)}`;
    if (!g) throw new ApiError(400, "Unknown group");
    if (g.program_id !== input.program_id) throw new ApiError(400, "The group does not belong to the selected program");
  }
  const { passport, jshshir, custom_data, ...rest } = input;
  const row: Record<string, unknown> = { ...rest, custom_data: { ...(existingCustom ?? {}), ...(await validateCustom(custom_data)) } };
  if (canSensitive) {
    if (passport !== undefined) {
      if (passport && !validatePassport(passport)) throw new ApiError(400, "Passport must be 2 letters followed by 7 digits (e.g. AB1234567)");
      row.passport_enc = passport ? encrypt(normalizeId(passport)) : null;
      row.passport_hash = passport ? blindIndex(passport) : null;
    }
    if (jshshir !== undefined) {
      if (jshshir && !validateJshshir(jshshir)) throw new ApiError(400, "JSHSHIR must be exactly 14 digits");
      row.jshshir_enc = jshshir ? encrypt(normalizeId(jshshir)) : null;
      row.jshshir_hash = jshshir ? blindIndex(jshshir) : null;
    }
  }
  return row;
}

/** Field-level diff for the audit log (sensitive values never written in clear). */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(after)) {
    if (k.endsWith("_hash")) continue;
    const b = before[k];
    if (JSON.stringify(b ?? null) !== JSON.stringify(v ?? null)) {
      changes[k.replace(/_enc$/, "")] = k.endsWith("_enc") ? { from: "•••", to: "•••" } : { from: b ?? null, to: v ?? null };
    }
  }
  return changes;
}
