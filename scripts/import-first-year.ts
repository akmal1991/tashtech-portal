/* Loads the real first-year student list ("Full Name | ID Matricula | Passport | Faculty | Group")
 * and creates faculties, programs, shared groups, first-semester subjects, courses and enrollments.
 *
 *   bun scripts/import-first-year.ts "<path to .xlsx>" [--replace-demo]
 *
 * --replace-demo removes ALL existing academic data (students, faculties, courses, marks, history,
 * notifications, audit log) first. Users, roles, permissions, grading schemes and settings are kept.
 * Without the flag the script only adds data and refuses to run if student IDs already exist.
 * Never commit the spreadsheet: it contains personal data. */
import postgres from "postgres";
import ExcelJS from "exceljs";
import { encrypt, blindIndex, normalizeId } from "../src/lib/crypto";

const file = process.argv[2];
const replace = process.argv.includes("--replace-demo");
if (!file) { console.error('Usage: bun scripts/import-first-year.ts "<file.xlsx>" [--replace-demo]'); process.exit(1); }

const ACADEMIC_YEAR = { name: "2026-2027", start: "2026-09-01", end: "2027-06-30" };
const SEMESTERS = [
  { number: 1, name: "2026-2027 · Semester 1", start: "2026-09-01", end: "2027-01-17", current: true },
  { number: 2, name: "2026-2027 · Semester 2", start: "2027-02-01", end: "2027-06-15", current: false },
];
const FACULTIES: Record<string, { code: string; program: string }> = {
  "Energy Engineering": { code: "ENE", program: "ENE-B" },
  "Electrical Engineering": { code: "ELE", program: "ELE-B" },
  "Industrial Engineering and Management": { code: "IEM", program: "IEM-B" },
  "Materials Science and Nanotechnology": { code: "MSN", program: "MSN-B" },
};
// First-semester common subjects (6 ECTS each; edit under Admin → Academic Structure → Subjects)
const SUBJECTS = [
  { code: "MATH101", name: "Mathematical Analysis I" },
  { code: "MATH102", name: "Linear Algebra" },
  { code: "ENGR101", name: "Introduction to Engineering" },
  { code: "CS101", name: "Fundamentals of Computer Science" },
  { code: "ENG101", name: "English for Engineering I" },
  { code: "HIST101", name: "Modern History of Uzbekistan" },
];

// ---------- read & validate spreadsheet ----------
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
const ws = wb.worksheets[0];
const text = (v: ExcelJS.CellValue) => {
  const x = v as { text?: string; result?: unknown; richText?: { text: string }[] } | string | number | null;
  if (x == null) return "";
  if (typeof x === "object") return String(x.richText?.map((r) => r.text).join("") ?? x.text ?? x.result ?? "").trim();
  return String(x).trim();
};
let headerRow = 0;
ws.eachRow((r, i) => { if (!headerRow && /full\s*name/i.test(text(r.getCell(1).value)) && /id/i.test(text(r.getCell(2).value))) headerRow = i; });
if (!headerRow) { console.error('Header row with "Full Name" / "ID Matricula" not found'); process.exit(1); }

const titleCase = (s: string) => s.toLocaleLowerCase("uz").replace(/(^|[\s-])(\S)/g, (_, a, b) => a + b.toLocaleUpperCase("uz"));
type Row = { row: number; id: string; last: string; first: string; middle: string | null; passport: string; faculty: string; group: string; gender: "Male" | "Female" | null };
const rows: Row[] = [];
const problems: string[] = [];
ws.eachRow((r, i) => {
  if (i <= headerRow) return;
  const [name, id, passport, faculty, group] = [1, 2, 3, 4, 5].map((c) => text(r.getCell(c).value));
  if (!name && !id) return;
  if (/^full\s*name$/i.test(name)) return; // repeated header
  const fixedName = name.replace(/\s+/g, " ").replace(/O['‘’`]G['‘’`]L I$/i, "O‘G‘LI");
  const parts = fixedName.split(" ");
  const pp = normalizeId(passport);
  const err: string[] = [];
  if (!/^TTB\d{7}$/i.test(id)) err.push(`invalid ID "${id}"`);
  if (!/^[A-Z]{2}\d{7}$/.test(pp)) err.push(`invalid passport "${passport}"`);
  if (!FACULTIES[faculty]) err.push(`unknown faculty "${faculty}"`);
  if (!/^BS26-\d+$/.test(group)) err.push(`unexpected group "${group}"`);
  if (parts.length < 2) err.push(`name "${name}" needs at least surname and given name`);
  if (err.length) { problems.push(`row ${i}: ${err.join("; ")}`); return; }
  const tail = parts.slice(2).join(" ");
  const gender = /(O.G.LI|OVICH|EVICH|YEVICH)$/i.test(tail) ? "Male" : /(QIZI|OVNA|EVNA|YEVNA)$/i.test(tail) ? "Female" : null;
  rows.push({ row: i, id: id.toUpperCase(), last: titleCase(parts[0]), first: titleCase(parts[1]), middle: tail ? titleCase(tail) : null, passport: pp, faculty, group, gender });
});
const dupId = rows.filter((r, i) => rows.findIndex((x) => x.id === r.id) !== i);
const dupPp = rows.filter((r, i) => rows.findIndex((x) => x.passport === r.passport) !== i);
for (const d of dupId) problems.push(`row ${d.row}: duplicate ID ${d.id}`);
for (const d of dupPp) problems.push(`row ${d.row}: duplicate passport (also used by another row)`);
console.log(`Read ${rows.length} valid student rows from "${ws.name}".`);
if (problems.length) { console.error("Problems found — nothing was imported:\n  " + problems.join("\n  ")); process.exit(1); }

// ---------- write ----------
const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
try {
  const [{ admin }] = await sql`select id as admin from users where username = 'admin'`;
  await sql.begin(async (tx) => {
    if (replace) {
      await tx`update users set faculty_id = null`;
      // TRUNCATE bypasses the append-only row triggers on purpose: this is a one-time switch from demo to real data.
      await tx.unsafe(`truncate grade_history, grade_change_requests, grades, attendance, student_enrollments, user_course_assignments,
        courses, subjects, students, student_groups, semesters, academic_years, notifications, import_export_history, audit_logs restart identity`);
      // Plain DELETE (no CASCADE) so user accounts that referenced a demo faculty are never touched.
      await tx`delete from programs`;
      await tx`delete from departments`;
      await tx`delete from faculties`;
    } else {
      const clash = await tx`select student_number from students where student_number = any(${rows.map((r) => r.id)})`;
      if (clash.length) throw new Error(`${clash.length} student ID(s) already exist (e.g. ${clash[0].student_number}). Nothing imported.`);
    }

    const [ay] = await tx`insert into academic_years (name, start_date, end_date, is_current) values (${ACADEMIC_YEAR.name}, ${ACADEMIC_YEAR.start}, ${ACADEMIC_YEAR.end}, true)
      on conflict (name) do update set is_current = true returning id`;
    await tx`update academic_years set is_current = false where id <> ${ay.id}`;
    const semIds: number[] = [];
    for (const s of SEMESTERS) {
      const [row] = await tx`insert into semesters (academic_year_id, number, name, start_date, end_date, is_current)
        values (${ay.id}, ${s.number}, ${s.name}, ${s.start}, ${s.end}, ${s.current})
        on conflict (academic_year_id, number) do update set name = excluded.name returning id`;
      semIds.push(row.id);
    }
    await tx`update semesters set is_current = (id = ${semIds[0]})`;

    const programIds: Record<string, number> = {};
    for (const [name, f] of Object.entries(FACULTIES)) {
      const [fac] = await tx`insert into faculties (code, name) values (${f.code}, ${"Faculty of " + name}) on conflict (code) do update set name = excluded.name returning id`;
      const [dep] = await tx`insert into departments (faculty_id, code, name) values (${fac.id}, ${f.code + "-D"}, ${"Department of " + name})
        on conflict (code) do update set name = excluded.name returning id`;
      const [prog] = await tx`insert into programs (department_id, code, name, degree_level, duration_years) values (${dep.id}, ${f.program}, ${name}, 'Bachelor', 4)
        on conflict (code) do update set name = excluded.name returning id`;
      programIds[name] = prog.id;
    }

    const groupIds: Record<string, number> = {};
    for (const g of [...new Set(rows.map((r) => r.group))].sort((a, b) => Number(a.split("-")[1]) - Number(b.split("-")[1]))) {
      const [row] = await tx`insert into student_groups (program_id, name, admission_year) values (null, ${g}, 2026)
        on conflict (name) do update set program_id = null returning id`;
      groupIds[g] = row.id;
    }

    const subjectIds: number[] = [];
    for (const s of SUBJECTS) {
      const [row] = await tx`insert into subjects (code, name, credits, ects) values (${s.code}, ${s.name}, 4, 6)
        on conflict (code) do update set name = excluded.name returning id`;
      subjectIds.push(row.id);
    }

    const studentRows = rows.map((r) => ({
      student_number: r.id, first_name: r.first, last_name: r.last, middle_name: r.middle,
      passport_enc: encrypt(r.passport), passport_hash: blindIndex(r.passport),
      gender: r.gender, program_id: programIds[r.faculty], group_id: groupIds[r.group],
      current_year: 1, current_semester: 1, study_mode: "Full-time", status: "Active", enrollment_date: "2026-09-01",
    }));
    const inserted = await tx`insert into students ${tx(studentRows)} returning id, group_id`;

    const [scheme] = await tx`select id from grading_schemes where is_default limit 1`;
    let courses = 0, enrollments = 0;
    for (const gid of Object.values(groupIds)) {
      for (const sub of subjectIds) {
        const [c] = await tx`insert into courses (subject_id, semester_id, group_id, grading_scheme_id) values (${sub}, ${semIds[0]}, ${gid}, ${scheme.id})
          on conflict (subject_id, semester_id, group_id) do update set group_id = excluded.group_id returning id`;
        courses++;
        const members = inserted.filter((s) => s.group_id === gid);
        if (members.length) {
          const e = await tx`insert into student_enrollments ${tx(members.map((m) => ({ student_id: m.id, course_id: c.id })))} on conflict do nothing returning id`;
          enrollments += e.length;
        }
      }
    }
    await tx`insert into audit_logs (user_id, action, entity, details) values (${admin}, ${replace ? "REAL_DATA_LOADED_DEMO_REMOVED" : "REAL_DATA_LOADED"}, 'system',
      ${tx.json({ source: file.split(/[\\/]/).pop(), students: inserted.length, groups: Object.keys(groupIds).length, subjects: subjectIds.length, courses, enrollments })})`;
    console.log(`Imported ${inserted.length} students, ${Object.keys(programIds).length} faculties/programs, ${Object.keys(groupIds).length} groups, ${subjectIds.length} subjects, ${courses} courses, ${enrollments} enrollments.`);
    console.log(`Gender inferred from patronymic for ${rows.filter((r) => r.gender).length}/${rows.length} students.`);
  });
} finally {
  await sql.end();
}
