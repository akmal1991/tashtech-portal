import "server-only";
import { sql } from "./db";
import { blindIndex, decrypt, encrypt, normalizeId } from "./crypto";
import { StudentInput, buildStudentRow, validateJshshir, validatePassport } from "./students";
import { courseScope } from "./academic";
import { changeGrade } from "./grades";
import { getSetting } from "./settings";
import type { Session } from "./auth";
import type { SheetData } from "./excel";

export const STUDENT_IMPORT_HEADERS: [string, string][] = [
  ["Student ID", "student_number"], ["Last Name", "last_name"], ["First Name", "first_name"], ["Middle Name", "middle_name"],
  ["Passport", "passport"], ["JSHSHIR", "jshshir"], ["Date of Birth", "date_of_birth"], ["Gender", "gender"],
  ["Program Code", "program_code"], ["Group", "group_name"], ["Year", "current_year"], ["Semester", "current_semester"],
  ["Study Mode", "study_mode"], ["Status", "status"], ["Enrollment Date", "enrollment_date"], ["Phone", "phone"],
  ["Email", "email"], ["Address", "address"], ["Notes", "notes"],
];
export const GRADE_IMPORT_FIXED = ["Student ID", "Subject Code", "Academic Year", "Semester", "Reason"];

export type PreviewRow = {
  row: number; action: "create" | "update" | "grades" | "skip" | "error";
  label: string; errors: string[]; warnings: string[]; changes?: { code: string; old: number | null; new: number | null; kind: "new" | "update" | "delete" | "approval" }[];
};
export type Preview = { id: number; entity: string; total: number; valid: number; invalid: number; rows: PreviewRow[]; warnings: string[] };

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

function toDate(v: string | undefined) {
  if (!v) return v;
  const m = v.match(/^(\d{2})[./](\d{2})[./](\d{4})$/); // DD.MM.YYYY
  return m ? `${m[3]}-${m[2]}-${m[1]}` : v;
}

// ---------------- Students ----------------
export async function previewStudents(s: Session, sheet: SheetData, fileName: string): Promise<Preview> {
  const canSensitive = s.permissions.has("students.view_sensitive");
  const custom = await sql`select field_key, label from custom_fields where entity = 'student' and is_active`;
  const map = new Map<string, string>();
  for (const [h, f] of STUDENT_IMPORT_HEADERS) map.set(norm(h), f);
  for (const c of custom) { map.set(norm(c.label), "custom:" + c.field_key); map.set(norm(c.field_key), "custom:" + c.field_key); }
  const warnings: string[] = [];
  const unknown = sheet.headers.filter((h) => !map.has(norm(h)));
  if (unknown.length) warnings.push(`Ignored columns: ${unknown.join(", ")}`);
  if (!canSensitive && sheet.headers.some((h) => ["passport", "jshshir"].includes(norm(h))))
    warnings.push("Passport / JSHSHIR columns are ignored: you do not have permission to write sensitive data.");

  const programs = new Map((await sql`select id, code from programs`).map((p) => [String(p.code).toUpperCase(), p.id as number]));
  const groups = new Map((await sql`select id, name, program_id from student_groups`).map((g) => [String(g.name).toUpperCase(), g]));
  const existing = new Map((await sql`select id, student_number from students where deleted_at is null`).map((r) => [String(r.student_number).toUpperCase(), r.id as number]));
  const hashes = new Map<string, number>();
  for (const r of await sql`select id, passport_hash, jshshir_hash from students where deleted_at is null`) {
    if (r.passport_hash) hashes.set(r.passport_hash, r.id);
    if (r.jshshir_hash) hashes.set(r.jshshir_hash, r.id);
  }

  const seen = new Map<string, number>();
  const rows: PreviewRow[] = [];
  const payload: { row: number; input: unknown; existingId: number | null }[] = [];
  for (const r of sheet.rows) {
    const raw: Record<string, string> = {};
    const customData: Record<string, string> = {};
    for (const [h, v] of Object.entries(r.values)) {
      const f = map.get(norm(h));
      if (!f) continue;
      if (f.startsWith("custom:")) customData[f.slice(7)] = v; else raw[f] = v;
    }
    const errors: string[] = [];
    const warn: string[] = [];
    const num = (raw.student_number ?? "").toUpperCase();
    const label = `${num || "?"} — ${raw.last_name ?? ""} ${raw.first_name ?? ""}`.trim();
    const programId = programs.get((raw.program_code ?? "").toUpperCase());
    if (!programId) errors.push(`Unknown program code "${raw.program_code ?? ""}"`);
    let groupId: number | null = null;
    if (raw.group_name) {
      const g = groups.get(raw.group_name.toUpperCase());
      if (!g) errors.push(`Unknown group "${raw.group_name}"`);
      else if (programId && g.program_id !== programId) errors.push(`Group ${raw.group_name} does not belong to program ${raw.program_code}`);
      else groupId = g.id;
    }
    const gender = raw.gender ? ({ m: "Male", male: "Male", erkak: "Male", f: "Female", female: "Female", ayol: "Female" } as Record<string, string>)[raw.gender.toLowerCase()] ?? raw.gender : undefined;
    const input = {
      student_number: num, first_name: raw.first_name ?? "", last_name: raw.last_name ?? "", middle_name: raw.middle_name,
      date_of_birth: toDate(raw.date_of_birth), gender, program_id: programId ?? 0, group_id: groupId,
      current_year: raw.current_year, current_semester: raw.current_semester,
      study_mode: raw.study_mode || undefined, status: raw.status || undefined, enrollment_date: toDate(raw.enrollment_date),
      phone: raw.phone, email: raw.email, address: raw.address, notes: raw.notes,
      ...(canSensitive && raw.passport !== undefined ? { passport: raw.passport } : {}),
      ...(canSensitive && raw.jshshir !== undefined ? { jshshir: raw.jshshir } : {}),
      custom_data: Object.keys(customData).length ? customData : undefined,
    };
    const parsed = StudentInput.safeParse(input);
    if (!parsed.success) for (const i of parsed.error.issues) if (!(i.path[0] === "program_id" && !programId)) errors.push(`${String(i.path[0] ?? "")}: ${i.message}`);
    const existingId = existing.get(num) ?? null;
    if (num) {
      if (seen.has("id:" + num)) errors.push(`Duplicate Student ID in file (also row ${seen.get("id:" + num)})`);
      seen.set("id:" + num, r.rowNumber);
    }
    for (const [k, v, ok] of [["Passport", raw.passport, validatePassport], ["JSHSHIR", raw.jshshir, validateJshshir]] as const) {
      if (!canSensitive || !v) continue;
      if (!ok(v)) { errors.push(`${k} has an invalid format`); continue; }
      const h = blindIndex(v)!;
      if (seen.has(h)) errors.push(`Duplicate ${k} in file (also row ${seen.get(h)})`);
      seen.set(h, r.rowNumber);
      const owner = hashes.get(h);
      if (owner && owner !== existingId) errors.push(`${k} already belongs to another student`);
    }
    if (existingId && !errors.length) warn.push("Existing student — record will be updated");
    rows.push({ row: r.rowNumber, action: errors.length ? "error" : existingId ? "update" : "create", label, errors, warnings: warn });
    if (!errors.length && parsed.success) payload.push({ row: r.rowNumber, input: parsed.data, existingId });
  }
  return savePreview(s, "students", fileName, rows, payload, warnings);
}

export async function commitStudents(s: Session, payload: { row: number; input: unknown; existingId: number | null }[]) {
  const canSensitive = s.permissions.has("students.view_sensitive");
  const results: { row: number; ok: boolean; error?: string; action?: string }[] = [];
  for (const p of payload) {
    try {
      const input = StudentInput.parse(p.input);
      if (p.existingId) {
        if (!s.permissions.has("students.edit")) throw new Error("No permission to update existing students");
        const [before] = await sql`select custom_data from students where id = ${p.existingId}`;
        const row = await buildStudentRow(input, canSensitive, before?.custom_data);
        await sql`update students set ${sql({ ...row, updated_at: new Date() } as never)} where id = ${p.existingId}`;
        results.push({ row: p.row, ok: true, action: "updated" });
      } else {
        if (!s.permissions.has("students.create")) throw new Error("No permission to create students");
        const row = await buildStudentRow(input, canSensitive);
        await sql`insert into students ${sql(row as never)}`;
        results.push({ row: p.row, ok: true, action: "created" });
      }
    } catch (e) {
      results.push({ row: p.row, ok: false, error: (e as Error).message });
    }
  }
  return results;
}

// ---------------- Grades ----------------
export async function previewGrades(s: Session, sheet: SheetData, fileName: string): Promise<Preview> {
  const types = await sql`select id, code, name from assessment_types where is_active`;
  const typeCols = sheet.headers.map((h) => ({ h, t: types.find((t) => norm(t.code) === norm(h) || norm(t.name) === norm(h)) })).filter((x) => x.t);
  const warnings: string[] = [];
  if (!typeCols.length) warnings.push("No assessment columns found. Use assessment codes as headers, e.g. P1, P2, CW, MID, FINAL, RETAKE.");
  const fixed = new Set(GRADE_IMPORT_FIXED.map(norm));
  const ignored = sheet.headers.filter((h) => !fixed.has(norm(h)) && !typeCols.some((t) => t.h === h));
  if (ignored.length) warnings.push(`Ignored columns: ${ignored.join(", ")}`);
  const get = (v: Record<string, string>, name: string) => Object.entries(v).find(([k]) => norm(k) === norm(name))?.[1] ?? "";

  const numbers = [...new Set(sheet.rows.map((r) => get(r.values, "Student ID").toUpperCase()).filter(Boolean))];
  const enr = numbers.length ? await sql`
    select e.id, e.status, upper(st.student_number) as num, upper(c.subject_code) as subj, c.academic_year_name as ay, c.semester_number as sem,
           c.is_locked, c.grading_scheme_id, c.id as course_id, st.last_name, st.first_name, c.subject_name
    from student_enrollments e join students st on st.id = e.student_id join v_courses c on c.id = e.course_id
    where upper(st.student_number) = any(${numbers}) ${courseScope(s)}` : [];
  const byKey = new Map(enr.map((e) => [`${e.num}|${e.subj}|${e.ay}|${e.sem}`, e]));
  const comps = await sql`select scheme_id, assessment_type_id, max_score from scheme_components`;
  const compMap = new Map(comps.map((c) => [`${c.scheme_id}:${c.assessment_type_id}`, c.max_score as number]));
  const enrollIds = enr.map((e) => e.id as number);
  const current = enrollIds.length ? await sql`select enrollment_id, assessment_type_id, score from grades where enrollment_id = any(${enrollIds})` : [];
  const curMap = new Map(current.map((g) => [`${g.enrollment_id}:${g.assessment_type_id}`, g.score as number | null]));
  const workflow = await getSetting("workflow");

  const rows: PreviewRow[] = [];
  const payload: { row: number; enrollmentId: number; marks: { typeId: number; score: number | null }[]; reason: string | null }[] = [];
  const seen = new Map<string, number>();
  for (const r of sheet.rows) {
    const errors: string[] = [];
    const num = get(r.values, "Student ID").toUpperCase();
    const subj = get(r.values, "Subject Code").toUpperCase();
    const ay = get(r.values, "Academic Year");
    const sem = Number(get(r.values, "Semester"));
    const key = `${num}|${subj}|${ay}|${sem}`;
    const e = byKey.get(key);
    const label = e ? `${num} — ${e.last_name} ${e.first_name} · ${e.subject_name} · ${ay} S${sem}` : `${num} · ${subj} · ${ay} S${sem}`;
    if (!num || !subj || !ay || !sem) errors.push("Student ID, Subject Code, Academic Year and Semester are required");
    else if (!e) errors.push("No matching enrollment (check IDs, or the course is not assigned to you)");
    if (seen.has(key)) errors.push(`Duplicate row for the same student/course (also row ${seen.get(key)})`);
    seen.set(key, r.rowNumber);
    const changes: NonNullable<PreviewRow["changes"]> = [];
    const marks: { typeId: number; score: number | null }[] = [];
    if (e) {
      if (e.status !== "Enrolled") errors.push("Student has withdrawn from this course");
      for (const { h, t } of typeCols) {
        const raw = r.values[h];
        if (raw === undefined || raw === "") continue;
        const max = compMap.get(`${e.grading_scheme_id}:${t!.id}`);
        if (max == null) { errors.push(`${t!.code} is not part of this course's grading scheme`); continue; }
        const isDelete = raw.trim() === "-";
        const score = isDelete ? null : Number(raw.replace(",", "."));
        if (!isDelete && (Number.isNaN(score) || (score as number) < 0 || (score as number) > max)) { errors.push(`${t!.code} must be between 0 and ${max} (got "${raw}")`); continue; }
        const old = curMap.get(`${e.id}:${t!.id}`) ?? null;
        if (old === score) continue;
        const needsApproval = (e.is_locked && !s.permissions.has("grades.override_lock")) || (old != null && workflow.requireApprovalForChanges && !s.permissions.has("grades.edit_direct"));
        changes.push({ code: t!.code, old, new: score, kind: needsApproval ? "approval" : old == null ? "new" : score == null ? "delete" : "update" });
        marks.push({ typeId: t!.id, score });
      }
    }
    const warn = changes.some((c) => c.kind === "approval") ? ["Some changes will be submitted for approval"] : [];
    rows.push({ row: r.rowNumber, action: errors.length ? "error" : changes.length ? "grades" : "skip", label, errors, warnings: warn, changes });
    if (!errors.length && marks.length) payload.push({ row: r.rowNumber, enrollmentId: e!.id, marks, reason: get(r.values, "Reason") || null });
  }
  return savePreview(s, "grades", fileName, rows, payload, warnings);
}

export async function commitGrades(s: Session, payload: { row: number; enrollmentId: number; marks: { typeId: number; score: number | null }[]; reason: string | null }[], fileName: string, ip: string | null) {
  const results: { row: number; ok: boolean; error?: string; action?: string }[] = [];
  for (const p of payload) {
    const actions: string[] = [];
    const errs: string[] = [];
    for (const m of p.marks) {
      try {
        const r = await changeGrade(s, { enrollmentId: p.enrollmentId, assessmentTypeId: m.typeId, score: m.score, reason: p.reason ?? `Excel import: ${fileName}` }, ip);
        actions.push(r.status);
      } catch (e) { errs.push((e as Error).message); }
    }
    results.push({ row: p.row, ok: errs.length === 0, error: errs.join("; ") || undefined, action: actions.join(", ") });
  }
  return results;
}

// ---------------- shared ----------------
async function savePreview(s: Session, entity: string, fileName: string, rows: PreviewRow[], payload: unknown, warnings: string[]): Promise<Preview> {
  const invalid = rows.filter((r) => r.action === "error").length;
  const [h] = await sql`insert into import_export_history (kind, entity, file_name, status, rows_total, rows_ok, rows_failed, errors, payload, user_id)
    values ('import', ${entity}, ${fileName}, 'preview', ${rows.length}, ${rows.length - invalid}, ${invalid},
      ${sql.json(rows.filter((r) => r.errors.length).map((r) => ({ row: r.row, errors: r.errors })) as never)},
      ${sql.json({ enc: encrypt(JSON.stringify(payload)) })}, ${s.user.id}) returning id`;
  return { id: h.id, entity, total: rows.length, valid: rows.length - invalid, invalid, rows, warnings };
}

export function openPayload<T>(payload: { enc?: string } | null): T {
  if (!payload?.enc) throw new Error("Import session has expired");
  return JSON.parse(decrypt(payload.enc)!) as T;
}

export { normalizeId };
