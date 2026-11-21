/* Demo data for Tashkent Tech Academic Records Portal.
 * Demo accounts (change passwords after first login in production):
 *   admin     / Admin@2026!      — Administrator
 *   operator  / Operator@2026!   — Data Entry Officer (Faculty of Computer Engineering courses)
 *   operator2 / Operator@2026!   — Data Entry Officer scoped to Faculty of Information Technologies
 *   viewer    / Viewer@2026!     — Viewer / Academic Staff
 */
import postgres from "postgres";
import bcrypt from "bcryptjs";
import { PERMISSIONS, ROLE_PRESETS } from "../src/lib/permissions";
import { encrypt, blindIndex } from "../src/lib/crypto";
import { computeResult, type Scheme, type Scores } from "../src/lib/grading";
import { SETTINGS_DEFAULTS } from "../src/lib/settings-defaults";

const sql = postgres(process.env.DATABASE_URL!, {
  onnotice: () => {},
  types: { numeric: { to: 1700, from: [1700], serialize: (x: unknown) => String(x), parse: (x: string) => parseFloat(x) } },
});

// ---------- deterministic randomness ----------
let state = 20261121;
const rnd = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
const normal = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const pad = (n: number, w: number) => String(n).padStart(w, "0");

async function chunked<T>(rows: T[], size: number, fn: (c: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

const [{ n: existing }] = await sql`select count(*)::int as n from information_schema.tables where table_name = 'students'`;
if (!existing) { console.error("Run `bun run db:migrate` first."); process.exit(1); }
const [{ n: studentCount }] = await sql`select count(*)::int as n from students`;
if (studentCount > 0 && !process.argv.includes("--force")) {
  console.log("Database already seeded. Use `bun run db:reset` to rebuild."); await sql.end(); process.exit(0);
}

console.log("Seeding permissions, roles, users …");
await sql`insert into permissions ${sql(PERMISSIONS.map((p) => ({ ...p })), "code", "category", "description")} on conflict (code) do nothing`;
const roleIds: Record<string, number> = {};
for (const [name, preset] of Object.entries(ROLE_PRESETS)) {
  const [r] = await sql`insert into roles (name, description, is_system) values (${name}, ${preset.description}, true) returning id`;
  roleIds[name] = r.id;
  await sql`insert into role_permissions ${sql(preset.permissions.map((p) => ({ role_id: r.id, permission_code: p })))}`;
}

// ---------- academic structure ----------
console.log("Seeding faculties, programs, years, semesters …");
const faculties = [
  { code: "FCE", name: "Faculty of Computer Engineering", dean: "Prof. Rustam Kholmatov" },
  { code: "FIT", name: "Faculty of Information Technologies", dean: "Prof. Dilnoza Yusupova" },
  { code: "FEM", name: "Faculty of Economics and Management", dean: "Prof. Anvar Saidov" },
];
const facId: Record<string, number> = {};
for (const f of faculties) facId[f.code] = (await sql`insert into faculties ${sql(f)} returning id`)[0].id;

const departments = [
  { faculty: "FCE", code: "SE", name: "Department of Software Engineering", head: "Dr. Bobur Nazarov" },
  { faculty: "FCE", code: "CSY", name: "Department of Computer Systems", head: "Dr. Farhod Ergashev" },
  { faculty: "FIT", code: "IS", name: "Department of Information Security", head: "Dr. Malika Rakhimova" },
  { faculty: "FIT", code: "DSC", name: "Department of Data Science", head: "Dr. Sherzod Tursunov" },
  { faculty: "FEM", code: "DEC", name: "Department of Digital Economics", head: "Dr. Gulnora Abdullayeva" },
];
const depId: Record<string, number> = {};
for (const d of departments)
  depId[d.code] = (await sql`insert into departments (faculty_id, code, name, head) values (${facId[d.faculty]}, ${d.code}, ${d.name}, ${d.head}) returning id`)[0].id;

const programs = [
  { dep: "SE", code: "SE-B", name: "Software Engineering", degree: "Bachelor", years: 4 },
  { dep: "CSY", code: "CE-B", name: "Computer Engineering", degree: "Bachelor", years: 4 },
  { dep: "IS", code: "CYB-B", name: "Cybersecurity", degree: "Bachelor", years: 4 },
  { dep: "DEC", code: "DE-B", name: "Digital Economics", degree: "Bachelor", years: 4 },
  { dep: "DSC", code: "DS-M", name: "Data Science", degree: "Master", years: 2 },
  { dep: "DSC", code: "AI-P", name: "Artificial Intelligence", degree: "PhD", years: 3 },
];
const progId: Record<string, number> = {};
for (const p of programs)
  progId[p.code] = (await sql`insert into programs (department_id, code, name, degree_level, duration_years) values (${depId[p.dep]}, ${p.code}, ${p.name}, ${p.degree}, ${p.years}) returning id`)[0].id;

type Sem = { id: number; startYear: number; number: number; start: string; end: string; current: boolean; locked: boolean };
const semesters: Sem[] = [];
for (const y of [2023, 2024, 2025, 2026]) {
  const current = y === 2026;
  const [ay] = await sql`insert into academic_years (name, start_date, end_date, is_current) values (${`${y}-${y + 1}`}, ${`${y}-09-01`}, ${`${y + 1}-06-30`}, ${current}) returning id`;
  const defs = [
    { number: 1, start: `${y}-09-02`, end: `${y + 1}-01-18` },
    { number: 2, start: `${y + 1}-02-03`, end: `${y + 1}-06-14` },
  ];
  for (const d of defs) {
    const isCur = current && d.number === 1;
    const locked = !current;
    const [s] = await sql`insert into semesters (academic_year_id, number, name, start_date, end_date, is_current, is_locked, locked_at)
      values (${ay.id}, ${d.number}, ${`${y}-${y + 1} · Semester ${d.number}`}, ${d.start}, ${d.end}, ${isCur}, ${locked}, ${locked ? new Date(d.end + "T18:00:00Z") : null}) returning id`;
    semesters.push({ id: s.id, startYear: y, number: d.number, start: d.start, end: d.end, current: isCur, locked });
  }
}

// ---------- grading ----------
console.log("Seeding grading schemes and subjects …");
const atypes = [
  { code: "P1", name: "Project 1", sort_order: 1 },
  { code: "P2", name: "Project 2", sort_order: 2 },
  { code: "CW", name: "Coursework / Assignments", sort_order: 3 },
  { code: "MID", name: "Midterm Examination", sort_order: 4 },
  { code: "FINAL", name: "Final Examination", sort_order: 5 },
  { code: "RETAKE", name: "Retake Examination", sort_order: 6 },
];
const at: Record<string, number> = {};
for (const a of atypes) at[a.code] = (await sql`insert into assessment_types ${sql(a)} returning id`)[0].id;
await sql`update assessment_types set replaces_type_id = ${at.FINAL}, description = 'Replaces the final examination mark when entered' where id = ${at.RETAKE}`;

const scale = [
  { letter: "A", min: 90, points: 4.0, label: "Excellent" },
  { letter: "B+", min: 85, points: 3.5, label: "Very good" },
  { letter: "B", min: 80, points: 3.0, label: "Good" },
  { letter: "C+", min: 75, points: 2.5, label: "Satisfactory+" },
  { letter: "C", min: 70, points: 2.0, label: "Satisfactory" },
  { letter: "D", min: 60, points: 1.0, label: "Pass" },
  { letter: "F", min: 0, points: 0, label: "Fail" },
];
async function makeScheme(name: string, description: string, isDefault: boolean, comps: [string, number, number, number][]): Promise<Scheme> {
  const [s] = await sql`insert into grading_schemes (name, description, pass_mark, min_attendance, retake_cap, is_default, scale)
    values (${name}, ${description}, 60, 0, null, ${isDefault}, ${sql.json(scale)}) returning id`;
  const components = [];
  for (const [code, weight, max, min] of comps) {
    await sql`insert into scheme_components (scheme_id, assessment_type_id, weight, max_score, min_score) values (${s.id}, ${at[code]}, ${weight}, ${max}, ${min})`;
    components.push({ assessmentTypeId: at[code], code, name: code, weight, maxScore: max, minScore: min, replacesTypeId: code === "RETAKE" ? at.FINAL : null });
  }
  return { id: s.id, name, passMark: 60, minAttendance: 0, retakeCap: null, scale, components };
}
const stdScheme = await makeScheme("Standard 100-point (Bachelor)", "Projects 20%, coursework 10%, midterm 30%, final 40% (final ≥ 12/40)", true,
  [["P1", 10, 10, 0], ["P2", 10, 10, 0], ["CW", 10, 10, 0], ["MID", 30, 30, 0], ["FINAL", 40, 40, 12], ["RETAKE", 0, 40, 0]]);
const mScheme = await makeScheme("Graduate exam-weighted (Master/PhD)", "Project 20%, midterm 30%, final 50%", false,
  [["P1", 20, 20, 0], ["MID", 30, 30, 0], ["FINAL", 50, 50, 15], ["RETAKE", 0, 50, 0]]);

const subjectsByDept: Record<string, [string, string, number][]> = {
  GEN: [["MATH101", "Higher Mathematics I", 6], ["ENG101", "English for Academic Purposes I", 4], ["HIST101", "History of Uzbekistan", 3], ["PHYS101", "Physics", 5],
    ["MATH102", "Higher Mathematics II", 6], ["ENG102", "English for Academic Purposes II", 4], ["PHIL101", "Philosophy", 3], ["DMAT201", "Discrete Mathematics", 5],
    ["STAT201", "Probability and Statistics", 5], ["LALG201", "Linear Algebra", 5], ["WRIT201", "Academic Writing", 3], ["ECON101", "Fundamentals of Economics", 4]],
  SE: [["CS101", "Programming Fundamentals (C++)", 6], ["CS102", "Object-Oriented Programming", 6], ["CS201", "Data Structures and Algorithms", 6], ["CS202", "Database Systems", 6],
    ["CS203", "Web Technologies", 5], ["CS204", "Operating Systems", 5], ["CS301", "Software Engineering", 6], ["CS302", "Computer Networks", 5],
    ["CS303", "Mobile Application Development", 5], ["CS304", "Software Testing and Quality", 5], ["CS401", "Cloud Computing", 5], ["CS402", "Software Architecture", 6],
    ["CS403", "Machine Learning", 6], ["CS404", "DevOps Engineering", 5]],
  CSY: [["CE101", "Digital Logic Design", 6], ["CE102", "Electronic Circuits", 5], ["CE201", "Computer Architecture", 6], ["CE202", "Microprocessor Systems", 5],
    ["CE203", "Signals and Systems", 5], ["CE204", "Embedded Systems", 6], ["CE301", "Computer Networks Engineering", 5], ["CE302", "VLSI Design", 5],
    ["CE303", "Internet of Things", 5], ["CE304", "Robotics Fundamentals", 5]],
  IS: [["CY101", "Introduction to Cybersecurity", 5], ["CY201", "Cryptography", 6], ["CY202", "Network Security", 6], ["CY203", "Operating System Security", 5],
    ["CY301", "Ethical Hacking", 6], ["CY302", "Digital Forensics", 5], ["CY303", "Secure Software Development", 5], ["CY304", "Security Risk Management", 4], ["CY401", "Malware Analysis", 5]],
  DSC: [["DS501", "Advanced Machine Learning", 6], ["DS502", "Big Data Analytics", 6], ["DS503", "Statistical Inference", 6], ["DS504", "Deep Learning", 6],
    ["DS505", "Data Visualization", 4], ["DS506", "Natural Language Processing", 6], ["DS507", "Research Methodology", 4], ["DS508", "Computer Vision", 6]],
  DEC: [["EC201", "Microeconomics", 5], ["EC202", "Macroeconomics", 5], ["EC203", "Financial Accounting", 5], ["EC204", "Corporate Finance", 5],
    ["EC301", "Digital Marketing", 4], ["EC302", "E-Commerce Systems", 5], ["EC303", "Business Analytics", 5], ["EC304", "Management Information Systems", 5], ["EC401", "Econometrics", 6]],
};
const subjId: Record<string, number> = {};
for (const [dep, list] of Object.entries(subjectsByDept))
  for (const [code, name, ects] of list)
    subjId[code] = (await sql`insert into subjects (code, name, department_id, credits, ects) values (${code}, ${name}, ${dep === "GEN" ? null : depId[dep]}, ${Math.round((ects * 2) / 3)}, ${ects}) returning id`)[0].id;

function curriculum(programCode: string, semIdx: number): string[] {
  const gen = subjectsByDept.GEN.map((s) => s[0]);
  const deptOf: Record<string, string> = { "SE-B": "SE", "CE-B": "CSY", "CYB-B": "IS", "DE-B": "DEC", "DS-M": "DSC", "AI-P": "DSC" };
  let dept = subjectsByDept[deptOf[programCode]].map((s) => s[0]);
  if (programCode === "DS-M" || programCode === "AI-P") {
    dept = [...dept, "CS403", "CS401"];
    return Array.from({ length: 4 }, (_, j) => dept[((semIdx - 1) * 4 + j) % dept.length]);
  }
  const genCount = (k: number) => Math.min(2, Math.max(0, gen.length - (k - 1) * 2));
  let used = 0;
  for (let k = 1; k < semIdx; k++) used += 4 - genCount(k);
  const out = gen.slice((semIdx - 1) * 2, (semIdx - 1) * 2 + genCount(semIdx));
  for (let j = 0; out.length < 4; j++) out.push(dept[(used + j) % dept.length]);
  return out;
}

// ---------- users ----------
const hash = (p: string) => bcrypt.hashSync(p, 12);
const mkUser = async (u: { username: string; full_name: string; email: string; pw: string; role: string; faculty?: string }) =>
  (await sql`insert into users (username, full_name, email, password_hash, role_id, faculty_id)
    values (${u.username}, ${u.full_name}, ${u.email}, ${hash(u.pw)}, ${roleIds[u.role]}, ${u.faculty ? facId[u.faculty] : null}) returning id`)[0].id as number;
const adminId = await mkUser({ username: "admin", full_name: "Registrar Office Administrator", email: "registrar@tashtech.uz", pw: "Admin@2026!", role: "Administrator" });
const operatorId = await mkUser({ username: "operator", full_name: "Nodira Usmonova", email: "n.usmonova@tashtech.uz", pw: "Operator@2026!", role: "Data Entry Officer", faculty: "FCE" });
const operator2Id = await mkUser({ username: "operator2", full_name: "Jamshid Toshmatov", email: "j.toshmatov@tashtech.uz", pw: "Operator@2026!", role: "Data Entry Officer", faculty: "FIT" });
await mkUser({ username: "viewer", full_name: "Dr. Kamola Sobirova", email: "k.sobirova@tashtech.uz", pw: "Viewer@2026!", role: "Viewer" });

for (const [key, value] of Object.entries(SETTINGS_DEFAULTS))
  await sql`insert into system_settings (key, value, updated_by) values (${key}, ${sql.json(value as never)}, ${adminId})`;

// ---------- groups & students ----------
console.log("Seeding groups and students …");
const groupDefs = [
  { name: "SE-22-01", program: "SE-B", adm: 2022, graduated: true },
  { name: "SE-23-01", program: "SE-B", adm: 2023 }, { name: "CYB-23-01", program: "CYB-B", adm: 2023 },
  { name: "SE-24-01", program: "SE-B", adm: 2024 }, { name: "CE-24-01", program: "CE-B", adm: 2024 }, { name: "DE-24-01", program: "DE-B", adm: 2024 },
  { name: "SE-25-01", program: "SE-B", adm: 2025 }, { name: "CE-25-01", program: "CE-B", adm: 2025 }, { name: "CYB-25-01", program: "CYB-B", adm: 2025 },
  { name: "DSM-25-01", program: "DS-M", adm: 2025 },
  { name: "SE-26-01", program: "SE-B", adm: 2026 }, { name: "DE-26-01", program: "DE-B", adm: 2026 }, { name: "DSM-26-01", program: "DS-M", adm: 2026 },
  { name: "AIP-26-01", program: "AI-P", adm: 2026 },
];
const curators = ["Dr. Akmal Yusupov", "Dr. Sevara Mirzayeva", "Dr. Olim Qodirov", "Dr. Nigora Umarova", "Dr. Erkin Jurayev", "Dr. Feruza Hasanova"];
const maleFirst = ["Aziz", "Bobur", "Jasur", "Sardor", "Otabek", "Javohir", "Doniyor", "Sherzod", "Ulugbek", "Farrukh", "Bekzod", "Akmal", "Islom", "Temur", "Shohruh", "Rustam", "Abdulla", "Muhammad", "Asadbek", "Diyor", "Komil", "Nodir", "Sanjar", "Jamshid"];
const femaleFirst = ["Madina", "Dilnoza", "Shahnoza", "Nilufar", "Gulnora", "Malika", "Sevara", "Zarina", "Kamola", "Mohira", "Feruza", "Laylo", "Nigora", "Dildora", "Mukhlisa", "Sabina", "Aziza", "Charos", "Munisa", "Yulduz"];
const lastBase = ["Karimov", "Rakhimov", "Tursunov", "Yusupov", "Abdullayev", "Ismoilov", "Nazarov", "Saidov", "Ergashev", "Kholmatov", "Mirzayev", "Umarov", "Aliyev", "Sobirov", "Qodirov", "Jurayev", "Hasanov", "Toshmatov", "Usmonov", "Normatov", "Davletov", "Ruziyev"];
const fathers = ["Akmal", "Rustam", "Botir", "Shavkat", "Ilhom", "Dilshod", "Anvar", "Farhod", "Olim", "Erkin", "Bahodir", "Sanjar", "Timur", "Nodir"];
const regions = ["Tashkent", "Samarkand", "Bukhara", "Andijan", "Fergana", "Namangan", "Khorezm", "Navoi", "Kashkadarya", "Surkhandarya", "Jizzakh", "Sirdarya", "Karakalpakstan"];
const usedPassports = new Set<string>();

type StudentRow = { id: number; groupName: string; status: string; ability: number; adm: number };
const studentsByGroup = new Map<string, StudentRow[]>();
const groupIds: Record<string, number> = {};
let seq = 0;
for (const gd of groupDefs) {
  const [g] = await sql`insert into student_groups (program_id, name, admission_year, curator) values (${progId[gd.program]}, ${gd.name}, ${gd.adm}, ${pick(curators)}) returning id`;
  groupIds[gd.name] = g.id;
  const size = gd.program === "AI-P" ? 6 : 16 + Math.floor(rnd() * 7);
  const prog = programs.find((p) => p.code === gd.program)!;
  const yearOfStudy = Math.min(2026 - gd.adm + 1, prog.years);
  const rows: Record<string, unknown>[] = [];
  const meta: { status: string; ability: number }[] = [];
  for (let i = 0; i < size; i++) {
    const male = rnd() < 0.55;
    const first = male ? pick(maleFirst) : pick(femaleFirst);
    const lb = pick(lastBase);
    const last = male ? lb : lb + "a";
    const father = pick(fathers);
    const middle = father + (male ? "ovich" : "ovna");
    const ageAtAdm = gd.program === "DS-M" ? 22 : gd.program === "AI-P" ? 25 : 18;
    const by = gd.adm - ageAtAdm - (rnd() < 0.2 ? 1 : 0);
    const dob = `${by}-${pad(1 + Math.floor(rnd() * 12), 2)}-${pad(1 + Math.floor(rnd() * 28), 2)}`;
    let passport: string;
    do passport = pick(["AA", "AB", "AC", "AD", "AE"]) + pad(Math.floor(rnd() * 9999999), 7); while (usedPassports.has(passport));
    usedPassports.add(passport);
    const centuryDigit = by >= 2000 ? (male ? 5 : 6) : male ? 3 : 4;
    const [yy, mm, dd] = [dob.slice(2, 4), dob.slice(5, 7), dob.slice(8, 10)];
    const jshshir = `${centuryDigit}${dd}${mm}${yy}${pad(Math.floor(rnd() * 999), 3)}${pad(Math.floor(rnd() * 999), 3)}${Math.floor(rnd() * 10)}`;
    seq++;
    let status = "Active";
    if (gd.graduated) status = "Graduated";
    else { const r = rnd(); if (r < 0.03) status = "Suspended"; else if (r < 0.05) status = "Withdrawn"; }
    const region = pick(regions);
    rows.push({
      student_number: `TT${String(gd.adm).slice(2)}${pad(seq, 5)}`,
      first_name: first, last_name: last, middle_name: middle,
      passport_enc: encrypt(passport), passport_hash: blindIndex(passport),
      jshshir_enc: encrypt(jshshir), jshshir_hash: blindIndex(jshshir),
      date_of_birth: dob, gender: male ? "Male" : "Female",
      program_id: progId[gd.program], group_id: g.id,
      current_year: yearOfStudy, current_semester: gd.graduated ? prog.years * 2 : (yearOfStudy - 1) * 2 + 1,
      study_mode: rnd() < 0.9 ? "Full-time" : "Part-time", status,
      enrollment_date: `${gd.adm}-09-01`,
      phone: `+998 9${Math.floor(rnd() * 10)} ${pad(Math.floor(rnd() * 1000), 3)} ${pad(Math.floor(rnd() * 100), 2)} ${pad(Math.floor(rnd() * 100), 2)}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}${pad(seq, 3)}@student.tashtech.uz`,
      address: `${region} region`,
      notes: status === "Suspended" ? "Academic leave (medical)" : null,
      custom_data: sql.json({ scholarship: pick(["State grant", "Contract", "Contract", "Contract"]), dormitory: rnd() < 0.3 }),
    });
    meta.push({ status, ability: clamp(75 + 12 * normal(), 38, 99) });
  }
  const inserted = await sql`insert into students ${sql(rows)} returning id`;
  studentsByGroup.set(gd.name, inserted.map((r, i) => ({ id: r.id, groupName: gd.name, status: meta[i].status, ability: meta[i].ability, adm: gd.adm })));
}

// ---------- courses, enrollments, grades ----------
console.log("Seeding courses, enrollments and grades (database trigger writes grade history) …");
const instructors = ["Dr. A. Karimov", "Dr. S. Mirzayeva", "Prof. B. Nazarov", "Dr. M. Rakhimova", "Dr. O. Qodirov", "Ms. L. Aliyeva", "Mr. T. Saidov", "Dr. F. Ergashev", "Dr. Z. Hasanova", "Prof. I. Normatov"];
const operatorCourses: number[] = [];
const operator2Courses: number[] = [];
let historyEntries = 0;

for (const sem of semesters) {
  const semCourses: { courseId: number; scheme: Scheme; students: StudentRow[]; difficulty: number }[] = [];
  for (const gd of groupDefs) {
    const prog = programs.find((p) => p.code === gd.program)!;
    const semIdx = (sem.startYear - gd.adm) * 2 + sem.number;
    if (semIdx < 1 || semIdx > prog.years * 2) continue;
    if (sem.startYear === 2026 && sem.number === 2) continue; // future semester
    const scheme = prog.degree === "Bachelor" ? stdScheme : mScheme;
    for (const code of curriculum(gd.program, semIdx)) {
      const [c] = await sql`insert into courses (subject_id, semester_id, group_id, instructor, grading_scheme_id, submitted_at, submitted_by)
        values (${subjId[code]}, ${sem.id}, ${groupIds[gd.name]}, ${pick(instructors)}, ${scheme.id}, ${sem.locked ? new Date(sem.end + "T12:00:00Z") : null}, ${sem.locked ? operatorId : null}) returning id`;
      if (sem.current && ["SE-B", "CE-B"].includes(gd.program)) operatorCourses.push(c.id);
      if (sem.current && ["CYB-B", "DS-M"].includes(gd.program)) operator2Courses.push(c.id);
      const enrolled = (studentsByGroup.get(gd.name) ?? []).filter((s) => !(sem.current && s.status !== "Active"));
      semCourses.push({ courseId: c.id, scheme, students: enrolled, difficulty: normal() * 5 });
    }
  }

  const enrollRows: Record<string, unknown>[] = [];
  const pendingGrades: { key: string; type: number; score: number; phase: string }[] = [];
  for (const c of semCourses) {
    for (const s of c.students) {
      const scores: Scores = {};
      const key = `${s.id}:${c.courseId}`;
      for (const comp of c.scheme.components) {
        if (comp.replacesTypeId != null) continue;
        if (sem.current) {
          if (comp.code === "FINAL") continue;
          if (rnd() < 0.07) continue; // some marks still missing
        }
        const pct = clamp(s.ability + c.difficulty + 9 * normal(), 0, 100) / 100;
        const score = Math.round(pct * comp.maxScore);
        scores[comp.assessmentTypeId] = score;
        pendingGrades.push({ key, type: comp.assessmentTypeId, score, phase: comp.code });
      }
      const attendance = sem.current ? null : Math.round(clamp(88 + 8 * normal() + (s.ability - 70) / 4, 55, 100));
      let res = computeResult(c.scheme, scores, attendance);
      if (!sem.current && res.needsRetake && rnd() < 0.8) {
        const rc = c.scheme.components.find((x) => x.replacesTypeId != null)!;
        const score = Math.round((clamp(s.ability + 18 + 6 * normal(), 30, 100) / 100) * rc.maxScore);
        scores[rc.assessmentTypeId] = score;
        pendingGrades.push({ key, type: rc.assessmentTypeId, score, phase: "RETAKE" });
        res = computeResult(c.scheme, scores, attendance);
      }
      enrollRows.push({
        student_id: s.id, course_id: c.courseId, final_score: res.total, letter_grade: res.letter, grade_point: res.points,
        result_status: res.status, needs_retake: res.needsRetake, attendance_pct: attendance, computed_at: new Date(),
      });
    }
  }
  const enrollIds = new Map<string, number>();
  await chunked(enrollRows, 1000, async (chunk) => {
    const out = await sql`insert into student_enrollments ${sql(chunk)} returning id, student_id, course_id`;
    for (const r of out) enrollIds.set(`${r.student_id}:${r.course_id}`, r.id);
  });

  // Insert marks in phases so history timestamps look realistic.
  const phaseDate = (phase: string): string => {
    if (sem.current) return ({ P1: "2026-10-03T10:15:00+05", CW: "2026-10-17T11:30:00+05", P2: "2026-10-31T09:45:00+05", MID: "2026-11-08T14:20:00+05" } as Record<string, string>)[phase] ?? "2026-11-10T10:00:00+05";
    if (phase === "RETAKE") { const d = new Date(sem.end); d.setDate(d.getDate() + 18); return d.toISOString().slice(0, 10) + "T15:00:00+05"; }
    if (phase === "FINAL") return sem.end + "T16:00:00+05";
    if (phase === "MID") { const d = new Date(sem.start); d.setDate(d.getDate() + 60); return d.toISOString().slice(0, 10) + "T13:00:00+05"; }
    const d = new Date(sem.start); d.setDate(d.getDate() + ({ P1: 30, CW: 50, P2: 90 } as Record<string, number>)[phase]); return d.toISOString().slice(0, 10) + "T10:00:00+05";
  };
  const phases = [...new Set(pendingGrades.map((g) => g.phase))];
  await sql.begin(async (tx) => {
    for (const phase of phases) {
      const enteredBy = phase === "RETAKE" ? adminId : operatorId;
      await tx`select set_config('app.user_id', ${String(enteredBy)}, true),
                      set_config('app.reason', ${phase === "RETAKE" ? "Retake examination result" : "Initial mark entry"}, true),
                      set_config('app.changed_at', ${phaseDate(phase)}, true)`;
      const rows = pendingGrades.filter((g) => g.phase === phase).map((g) => ({
        enrollment_id: enrollIds.get(g.key)!, assessment_type_id: g.type, score: g.score,
        entered_by: enteredBy, updated_by: enteredBy, entered_at: phaseDate(phase), updated_at: phaseDate(phase),
      }));
      historyEntries += rows.length;
      await chunked(rows, 2000, (chunk) => tx`insert into grades ${tx(chunk)}`);
    }
  });
  console.log(`  ${semesters.indexOf(sem) + 1}/${semesters.length} semester: ${semCourses.length} courses, ${enrollRows.length} enrollments`);
}

await sql`insert into user_course_assignments ${sql(operatorCourses.map((c) => ({ user_id: operatorId, course_id: c })))}`;
await sql`insert into user_course_assignments ${sql(operator2Courses.map((c) => ({ user_id: operator2Id, course_id: c })))}`;

// ---------- attendance (current semester) ----------
console.log("Seeding attendance for the current semester …");
const curSem = semesters.find((s) => s.current)!;
const curEnrollments = await sql`select e.id from student_enrollments e join courses c on c.id = e.course_id where c.semester_id = ${curSem.id}`;
const dates = Array.from({ length: 10 }, (_, i) => { const d = new Date("2026-09-07"); d.setDate(d.getDate() + i * 7); return d.toISOString().slice(0, 10); });
const attRows: Record<string, unknown>[] = [];
for (const e of curEnrollments) {
  const base = 0.82 + rnd() * 0.17;
  for (const d of dates) {
    const r = rnd();
    attRows.push({ enrollment_id: e.id, session_date: d, status: r < base ? "present" : r < base + 0.05 ? "late" : r < base + 0.08 ? "excused" : "absent", recorded_by: operatorId });
  }
}
await chunked(attRows, 3000, (chunk) => sql`insert into attendance ${sql(chunk)}`);
await sql`update student_enrollments e set attendance_pct = a.pct from (
    select enrollment_id, round(100.0 * count(*) filter (where status in ('present','late')) / nullif(count(*) filter (where status <> 'excused'), 0), 2) as pct
    from attendance group by enrollment_id) a where a.enrollment_id = e.id`;

// ---------- approval workflow examples ----------
console.log("Seeding approval requests, notifications, custom fields and modules …");
const sample = await sql`select g.enrollment_id, g.assessment_type_id, g.score, c.id as course_id, c.semester_id
  from grades g join student_enrollments e on e.id = g.enrollment_id join courses c on c.id = e.course_id
  where c.id = any(${operatorCourses}) and g.score is not null order by g.id limit 6`;
const reasons = ["Calculation error in project rubric", "Late submission accepted with medical certificate", "Re-marking after student appeal", "Data entry typo (digits swapped)"];
for (const [i, s] of sample.slice(0, 4).entries()) {
  await sql`insert into grade_change_requests (enrollment_id, assessment_type_id, old_score, new_score, reason, requested_by, requested_at)
    values (${s.enrollment_id}, ${s.assessment_type_id}, ${s.score}, ${Math.max(0, s.score - 1 + (i % 3))}, ${reasons[i]}, ${operatorId}, now() - ${`${i + 1} hours`}::interval)`;
}
// A completed, approved change (writes 'Updated' history via the trigger, linked to the approval)
const ap = sample[4];
if (ap) {
  const newScore = Math.min(ap.score + 2, 30);
  const [req] = await sql`insert into grade_change_requests (enrollment_id, assessment_type_id, old_score, new_score, reason, requested_by, requested_at, status, reviewed_by, reviewed_at, review_comment)
    values (${ap.enrollment_id}, ${ap.assessment_type_id}, ${ap.score}, ${newScore}, 'Re-marking after student appeal', ${operatorId}, now() - interval '3 days', 'approved', ${adminId}, now() - interval '2 days', 'Appeal committee confirmed the re-mark') returning id`;
  await sql.begin(async (tx) => {
    await tx`select set_config('app.user_id', ${String(operatorId)}, true), set_config('app.reason', 'Re-marking after student appeal', true),
      set_config('app.approval_id', ${String(req.id)}, true), set_config('app.approval_status', 'Approved', true), set_config('app.approved_by', ${String(adminId)}, true),
      set_config('app.changed_at', ${new Date(Date.now() - 2 * 86400000).toISOString()}, true)`;
    await tx`update grades set score = ${newScore}, updated_by = ${operatorId}, updated_at = now() - interval '2 days' where enrollment_id = ${ap.enrollment_id} and assessment_type_id = ${ap.assessment_type_id}`;
  });
}
const rj = sample[5];
if (rj) await sql`insert into grade_change_requests (enrollment_id, assessment_type_id, old_score, new_score, reason, requested_by, requested_at, status, reviewed_by, reviewed_at, review_comment)
  values (${rj.enrollment_id}, ${rj.assessment_type_id}, ${rj.score}, ${rj.score + 3}, 'Student requested higher mark', ${operatorId}, now() - interval '5 days', 'rejected', ${adminId}, now() - interval '4 days', 'No supporting evidence provided')`;

// recompute the approved enrollment's result
await sql`insert into notifications (user_id, type, title, body, link, created_at) values
  (${adminId}, 'approval', '4 grade change requests pending', 'Nodira Usmonova submitted grade changes that need your approval.', '/approvals', now() - interval '1 hour'),
  (${adminId}, 'missing', 'Missing grades in current semester', 'Several students have missing project or midterm marks.', '/courses?missing=1', now() - interval '6 hours'),
  (${adminId}, 'submission', 'Midterm marks entered', 'Midterm marks were entered for Faculty of Computer Engineering courses.', '/courses', now() - interval '13 days'),
  (${operatorId}, 'approval', 'Grade change approved', 'Your request "Re-marking after student appeal" was approved.', '/approvals?tab=mine', now() - interval '2 days'),
  (${operatorId}, 'approval', 'Grade change rejected', 'Your request "Student requested higher mark" was rejected: No supporting evidence provided.', '/approvals?tab=mine', now() - interval '4 days')`;

await sql`insert into custom_fields (entity, field_key, label, field_type, options, is_required, sort_order) values
  ('student', 'scholarship', 'Funding / Scholarship', 'select', 'State grant,Contract,Presidential scholarship', false, 1),
  ('student', 'dormitory', 'Lives in dormitory', 'checkbox', null, false, 2)`;
await sql`insert into custom_modules (slug, title, icon, content, sort_order) values
  ('regulations', 'Academic Regulations', 'BookOpen', ${`# Academic Regulations (summary)

## Assessment
- Each course is assessed according to its **grading scheme** (Admin → Grading).
- The pass mark is **60 / 100**. The final examination has a minimum threshold.
- Students who fail may sit **one retake examination**; the retake replaces the final exam mark.

## Grade changes
- After a semester is **locked**, marks can only be changed by an administrator.
- Every change requires a **reason** and is permanently recorded in the grade history.

## Contacts
Registrar Office — room A-104, registrar@tashtech.uz`}, 1)`;

await sql`insert into audit_logs (user_id, action, entity, details) values (${adminId}, 'SYSTEM_SEEDED', 'system', ${sql.json({ students: seq, gradeEntries: historyEntries })})`;

const [counts] = await sql`select (select count(*) from students)::int s, (select count(*) from courses)::int c, (select count(*) from student_enrollments)::int e,
  (select count(*) from grades)::int g, (select count(*) from grade_history)::int h`;
console.log(`Done: ${counts.s} students, ${counts.c} courses, ${counts.e} enrollments, ${counts.g} marks, ${counts.h} history rows.`);
await sql.end();
