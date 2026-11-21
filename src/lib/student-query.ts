import "server-only";
import { sql } from "./db";
import { blindIndex } from "./crypto";
import { studentScope } from "./academic";
import type { Session } from "./auth";

export const FILTER_KEYS = ["q", "faculty", "program", "group", "status", "year", "semester", "degree", "mode", "subject", "ay", "sem", "grade", "result", "archived"] as const;
export type StudentFilters = Partial<Record<(typeof FILTER_KEYS)[number], string>>;

export function parseFilters(sp: Record<string, string | string[] | undefined> | URLSearchParams): StudentFilters {
  const get = (k: string) => (sp instanceof URLSearchParams ? sp.get(k) : (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k])) ?? undefined;
  const f: StudentFilters = {};
  for (const k of FILTER_KEYS) { const v = get(k)?.trim(); if (v) f[k] = v; }
  return f;
}

const num = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : null);

/** WHERE fragment for v_students alias `s` (always starts with `where`). */
export function studentWhere(session: Session, f: StudentFilters) {
  const canSensitive = session.permissions.has("students.view_sensitive");
  const q = f.q ?? "";
  const like = `%${q}%`;
  const hash = canSensitive && q ? blindIndex(q) : null;
  const enrollCond = f.subject || f.ay || f.sem || f.grade || f.result;
  return sql`where ${f.archived ? sql`s.deleted_at is not null` : sql`s.deleted_at is null`}
    ${studentScope(session)}
    ${q ? sql`and (s.student_number ilike ${like} or (s.last_name || ' ' || s.first_name || ' ' || coalesce(s.middle_name,'')) ilike ${like}
              or (s.first_name || ' ' || s.last_name) ilike ${like} or s.email ilike ${like}
              ${hash ? sql`or s.passport_hash = ${hash} or s.jshshir_hash = ${hash}` : sql``})` : sql``}
    ${num(f.faculty) ? sql`and s.faculty_id = ${num(f.faculty)}` : sql``}
    ${num(f.program) ? sql`and s.program_id = ${num(f.program)}` : sql``}
    ${num(f.group) ? sql`and s.group_id = ${num(f.group)}` : sql``}
    ${f.status ? sql`and s.status = ${f.status}` : sql``}
    ${num(f.year) ? sql`and s.current_year = ${num(f.year)}` : sql``}
    ${num(f.semester) ? sql`and s.current_semester = ${num(f.semester)}` : sql``}
    ${f.degree ? sql`and s.degree_level = ${f.degree}` : sql``}
    ${f.mode ? sql`and s.study_mode = ${f.mode}` : sql``}
    ${enrollCond ? sql`and exists (select 1 from student_enrollments e join v_courses c on c.id = e.course_id where e.student_id = s.id
        ${num(f.subject) ? sql`and c.subject_id = ${num(f.subject)}` : sql``}
        ${num(f.ay) ? sql`and c.academic_year_id = ${num(f.ay)}` : sql``}
        ${num(f.sem) ? sql`and c.semester_id = ${num(f.sem)}` : sql``}
        ${f.grade ? sql`and e.letter_grade = ${f.grade}` : sql``}
        ${f.result === "retake" ? sql`and e.needs_retake` : f.result ? sql`and e.result_status = ${f.result}` : sql``})` : sql``}`;
}

export const SORTS: Record<string, string> = {
  name: "s.last_name, s.first_name", id: "s.student_number", group: "s.group_name, s.last_name", program: "s.program_name, s.last_name",
  status: "s.status, s.last_name", year: "s.current_year, s.last_name", faculty: "s.faculty_name, s.last_name", created: "s.created_at",
};

export function orderBy(sort?: string, dir?: string) {
  const col = SORTS[sort ?? "name"] ?? SORTS.name;
  const d = dir === "desc" ? "desc" : "asc";
  return sql.unsafe(col.split(",").map((c) => `${c.trim()} ${d}`).join(", "));
}
