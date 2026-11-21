/* End-to-end API tests against a running dev server (bun run dev) and the seeded database.
 * Run: bun test tests   (BASE_URL defaults to http://localhost:3000)
 * Note: these tests modify demo data; re-run `bun run db:reset` afterwards for a clean state. */
import { beforeAll, describe, expect, test } from "bun:test";
import postgres from "postgres";
import ExcelJS from "exceljs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const db = postgres(process.env.DATABASE_URL!, { onnotice: () => {}, types: { numeric: { to: 1700, from: [1700], serialize: (x: unknown) => String(x), parse: (x: string) => parseFloat(x) } } });

type Client = { cookie: string; call: (path: string, init?: { method?: string; body?: unknown; form?: FormData; origin?: string | null }) => Promise<Response> };
async function login(username: string, password: string): Promise<Client> {
  const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE }, body: JSON.stringify({ username, password }) });
  expect(r.status).toBe(200);
  const cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
  return {
    cookie,
    call: (path, init = {}) => fetch(`${BASE}${path}`, {
      method: init.method ?? (init.body || init.form ? "POST" : "GET"),
      headers: { Cookie: cookie, ...(init.origin === null ? {} : { Origin: init.origin ?? BASE }), ...(init.form ? {} : { "Content-Type": "application/json" }) },
      body: init.form ?? (init.body ? JSON.stringify(init.body) : undefined),
    }),
  };
}

let admin: Client, operator: Client, viewer: Client;
let ids: { atP1: number; atMID: number; opEnrollment: number; opCourse: number; otherCourse: number; lockedEnrollment: number; studentId: number };

beforeAll(async () => {
  admin = await login("admin", "Admin@2026!");
  operator = await login("operator", "Operator@2026!");
  viewer = await login("viewer", "Viewer@2026!");
  const [at] = await db`select (select id from assessment_types where code = 'P1') as p1, (select id from assessment_types where code = 'MID') as mid`;
  const [op] = await db`select e.id as enrollment_id, e.course_id, e.student_id from user_course_assignments a join users u on u.id = a.user_id and u.username = 'operator'
    join student_enrollments e on e.course_id = a.course_id join courses c on c.id = e.course_id join grading_schemes g on g.id = c.grading_scheme_id
    where g.name like 'Standard%' and e.status = 'Enrolled'
    and not exists (select 1 from grade_change_requests r where r.enrollment_id = e.id) order by e.id limit 1`;
  const [other] = await db`select c.id from courses c join semesters s on s.id = c.semester_id where s.is_current
    and c.id not in (select course_id from user_course_assignments a join users u on u.id = a.user_id where u.username = 'operator') limit 1`;
  const [locked] = await db`select e.id from student_enrollments e join courses c on c.id = e.course_id join semesters s on s.id = c.semester_id
    join user_course_assignments a on a.course_id = c.id where s.is_locked limit 1`;
  // give the operator one locked-semester course for the lock test
  const [lockedAny] = await db`select e.id, e.course_id from student_enrollments e join courses c on c.id = e.course_id join semesters s on s.id = c.semester_id
    join grading_schemes g on g.id = c.grading_scheme_id where s.is_locked and g.name like 'Standard%' order by e.id limit 1`;
  if (!locked) await db`insert into user_course_assignments (user_id, course_id) select id, ${lockedAny.course_id} from users where username = 'operator' on conflict do nothing`;
  ids = { atP1: at.p1, atMID: at.mid, opEnrollment: op.enrollment_id, opCourse: op.course_id, otherCourse: other.id, lockedEnrollment: locked?.id ?? lockedAny.id, studentId: op.student_id };
});

describe("authentication & security", () => {
  test("wrong password is rejected and logged", async () => {
    const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE }, body: JSON.stringify({ username: "viewer", password: "nope" }) });
    expect(r.status).toBe(401);
    const [l] = await db`select action from audit_logs where action = 'LOGIN_FAILED' order by id desc limit 1`;
    expect(l.action).toBe("LOGIN_FAILED");
  });
  test("unauthenticated API access is refused", async () => {
    expect((await fetch(`${BASE}/api/notifications`)).status).toBe(401);
  });
  test("cross-origin state-changing request is blocked (CSRF)", async () => {
    const r = await admin.call("/api/notifications", { body: { all: true }, origin: "https://evil.example" });
    expect(r.status).toBe(403);
  });
  test("passwords are bcrypt-hashed and passport data is encrypted at rest", async () => {
    const [u] = await db`select password_hash from users where username = 'admin'`;
    expect(u.password_hash.startsWith("$2")).toBe(true);
    const [s] = await db`select passport_enc, jshshir_enc from students limit 1`;
    expect(s.passport_enc.startsWith("v1:")).toBe(true);
    expect(s.jshshir_enc).not.toMatch(/^\d{14}$/);
  });
  test("history and audit tables are append-only", async () => {
    expect(db`delete from grade_history where id = (select min(id) from grade_history)`).rejects.toThrow(/append-only/);
    expect(db`update audit_logs set action = 'x' where id = (select min(id) from audit_logs)`).rejects.toThrow(/append-only/);
  });
});

describe("role-based access control", () => {
  test("viewer can read but not modify", async () => {
    expect((await viewer.call(`/api/students?q=a`)).status).toBe(200);
    expect((await viewer.call("/api/grades", { body: { enrollmentId: ids.opEnrollment, assessmentTypeId: ids.atP1, score: 5 } })).status).toBe(403);
    expect((await viewer.call("/api/students", { body: {} })).status).toBe(403);
  });
  test("viewer cannot see passport / JSHSHIR", async () => {
    expect((await viewer.call(`/api/students/${ids.studentId}/sensitive`)).status).toBe(403);
  });
  test("admin sensitive-data access is audited", async () => {
    const r = await admin.call(`/api/students/${ids.studentId}/sensitive`);
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.passport).toMatch(/^[A-Z]{2}\d{7}$/);
    expect(d.jshshir).toMatch(/^\d{14}$/);
    const [l] = await db`select action from audit_logs where action = 'SENSITIVE_DATA_VIEWED' and entity_id = ${String(ids.studentId)} order by id desc limit 1`;
    expect(l).toBeDefined();
  });
  test("operator cannot change settings, manage users or roles", async () => {
    expect((await operator.call("/api/admin/settings", { method: "PUT", body: { key: "workflow", value: {} } })).status).toBe(403);
    expect((await operator.call("/api/admin/users", { body: {} })).status).toBe(403);
    expect((await operator.call("/api/admin/roles", { body: {} })).status).toBe(403);
  });
  test("operator only reaches assigned courses", async () => {
    const [e] = await db`select id from student_enrollments where course_id = ${ids.otherCourse} limit 1`;
    const r = await operator.call("/api/grades", { body: { enrollmentId: e.id, assessmentTypeId: ids.atP1, score: 5 } });
    expect(r.status).toBe(404);
  });
});

describe("grade entry, approval workflow, locking and audit trail", () => {
  test("operator enters a new mark directly; history row is written by the database", async () => {
    await db.begin(async (tx) => {
      await tx`select set_config('app.reason', 'test reset', true)`;
      await tx`update grades set score = null where enrollment_id = ${ids.opEnrollment} and assessment_type_id = ${ids.atP1}`;
    });
    const before = (await db`select count(*)::int as n from grade_history where enrollment_id = ${ids.opEnrollment}`)[0].n;
    const r = await operator.call("/api/grades", { body: { enrollmentId: ids.opEnrollment, assessmentTypeId: ids.atP1, score: 7 } });
    expect(r.status).toBe(200);
    expect((await r.json()).status).toBe("applied");
    const [h] = await db`select h.*, u.username from grade_history h join users u on u.id = h.changed_by where enrollment_id = ${ids.opEnrollment} order by h.id desc limit 1`;
    expect(h.action).toBe("Created");
    expect(h.new_score).toBe(7);
    expect(h.username).toBe("operator");
    expect((await db`select count(*)::int as n from grade_history where enrollment_id = ${ids.opEnrollment}`)[0].n).toBe(before + 1);
  });
  test("score outside 0..max is rejected", async () => {
    const r = await operator.call("/api/grades", { body: { enrollmentId: ids.opEnrollment, assessmentTypeId: ids.atP1, score: 11 } });
    expect(r.status).toBe(400);
  });
  test("modifying an existing mark needs a reason", async () => {
    const r = await operator.call("/api/grades", { body: { enrollmentId: ids.opEnrollment, assessmentTypeId: ids.atP1, score: 8 } });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/reason/i);
  });
  let requestId = 0;
  test("operator modification becomes a pending approval request (mark unchanged)", async () => {
    const r = await operator.call("/api/grades", { body: { enrollmentId: ids.opEnrollment, assessmentTypeId: ids.atP1, score: 8, reason: "Rubric recount" } });
    const d = await r.json();
    expect(d.status).toBe("pending");
    requestId = d.requestId;
    const [g] = await db`select score from grades where enrollment_id = ${ids.opEnrollment} and assessment_type_id = ${ids.atP1}`;
    expect(g.score).toBe(7);
    const [n] = await db`select count(*)::int as n from notifications n join users u on u.id = n.user_id where u.username = 'admin' and n.title = 'Grade change awaiting approval'`;
    expect(n.n).toBeGreaterThan(0);
  });
  test("operator cannot approve; admin approval applies the change with approval metadata", async () => {
    expect((await operator.call(`/api/approvals/${requestId}`, { body: { decision: "approved" } })).status).toBe(403);
    const r = await admin.call(`/api/approvals/${requestId}`, { body: { decision: "approved", comment: "OK" } });
    expect(r.status).toBe(200);
    const [g] = await db`select score from grades where enrollment_id = ${ids.opEnrollment} and assessment_type_id = ${ids.atP1}`;
    expect(g.score).toBe(8);
    const [h] = await db`select * from grade_history where enrollment_id = ${ids.opEnrollment} order by id desc limit 1`;
    expect(h).toMatchObject({ action: "Updated", old_score: 7, new_score: 8, reason: "Rubric recount", approval_status: "Approved", approval_request_id: requestId });
  });
  test("totals are recalculated automatically", async () => {
    const [e] = await db`select final_score from student_enrollments where id = ${ids.opEnrollment}`;
    const marks = await db`select g.score, sc.weight, sc.max_score from grades g join student_enrollments e on e.id = g.enrollment_id join courses c on c.id = e.course_id
      join scheme_components sc on sc.scheme_id = c.grading_scheme_id and sc.assessment_type_id = g.assessment_type_id where g.enrollment_id = ${ids.opEnrollment} and g.score is not null and sc.weight > 0`;
    const expected = Math.round(marks.reduce((a, m) => a + (m.score / m.max_score) * m.weight, 0) * 100) / 100;
    expect(e.final_score).toBe(expected);
  });
  test("admin modifies directly (with reason) — no approval needed", async () => {
    const r = await admin.call("/api/grades", { body: { enrollmentId: ids.opEnrollment, assessmentTypeId: ids.atP1, score: 9, reason: "Registrar correction" } });
    expect((await r.json()).status).toBe("applied");
  });
  test("locked semester: operator change is routed to approval, never applied", async () => {
    const [cur] = await db`select score from grades where enrollment_id = ${ids.lockedEnrollment} and assessment_type_id = ${ids.atMID}`;
    const newScore = cur.score >= 29 ? cur.score - 1 : cur.score + 1;
    const r = await operator.call("/api/grades", { body: { enrollmentId: ids.lockedEnrollment, assessmentTypeId: ids.atMID, score: newScore, reason: "Late appeal" } });
    const d = await r.json();
    expect(d.status).toBe("pending");
    expect(d.message).toMatch(/locked/i);
    const [after] = await db`select score from grades where enrollment_id = ${ids.lockedEnrollment} and assessment_type_id = ${ids.atMID}`;
    expect(after.score).toBe(cur.score);
  });
  test("deleting a mark keeps history (score -> null, action Deleted)", async () => {
    const r = await admin.call("/api/grades", { body: { enrollmentId: ids.opEnrollment, assessmentTypeId: ids.atP1, score: null, reason: "Entered for wrong student" } });
    expect((await r.json()).status).toBe("applied");
    const [h] = await db`select action, old_score, new_score from grade_history where enrollment_id = ${ids.opEnrollment} order by id desc limit 1`;
    expect(h).toMatchObject({ action: "Deleted", old_score: 9, new_score: null });
  });
});

describe("students CRUD", () => {
  let created = 0;
  test("create with encrypted identifiers; duplicate passport rejected", async () => {
    const [g] = await db`select g.id, g.program_id from student_groups g where g.name = 'SE-26-01'`;
    const body = { student_number: "TT26TEST01", first_name: "Test", last_name: "Student", program_id: g.program_id, group_id: g.id, passport: "AZ7654321", jshshir: "51234567890123", status: "Active", study_mode: "Full-time" };
    const r = await admin.call("/api/students", { body });
    expect(r.status).toBe(200);
    created = (await r.json()).id;
    const dup = await admin.call("/api/students", { body: { ...body, student_number: "TT26TEST02" } });
    expect(dup.status).toBe(409);
  });
  test("update is audited with a field diff", async () => {
    const [st] = await db`select * from students where id = ${created}`;
    const r = await admin.call(`/api/students/${created}`, { method: "PUT", body: { student_number: st.student_number, first_name: "Tested", last_name: st.last_name, program_id: st.program_id, group_id: st.group_id } });
    expect(r.status).toBe(200);
    const [l] = await db`select details from audit_logs where action = 'STUDENT_UPDATED' and entity_id = ${String(created)} order by id desc limit 1`;
    expect(l.details.changes.first_name).toEqual({ from: "Test", to: "Tested" });
  });
  test("delete requires typed confirmation; soft delete is recoverable", async () => {
    expect((await admin.call(`/api/students/${created}`, { method: "DELETE", body: { confirm: "wrong", reason: "test" } })).status).toBe(400);
    expect((await admin.call(`/api/students/${created}`, { method: "DELETE", body: { confirm: "TT26TEST01", reason: "duplicate record" } })).status).toBe(200);
    expect((await admin.call(`/api/students/${created}/restore`, { method: "POST" })).status).toBe(200);
  });
});

describe("Excel and PDF", () => {
  test("student import: preview validates, detects duplicates, commit creates", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Students");
    ws.addRow(["Student ID", "Last Name", "First Name", "Program Code", "Group", "Passport", "JSHSHIR", "Date of Birth", "Gender", "Funding / Scholarship"]);
    ws.addRow(["TT26IMP001", "Importov", "Alisher", "SE-B", "SE-26-01", "AQ1111111", "51111111111111", "2008-03-04", "Male", "Contract"]);
    ws.addRow(["TT26IMP002", "Importova", "Lola", "SE-B", "SE-26-01", "AQ1111111", "", "2008-05-06", "Female", ""]); // duplicate passport
    ws.addRow(["TT26IMP003", "Bad", "Program", "XX-B", "", "", "", "", "", ""]); // unknown program
    const fd = new FormData();
    fd.set("entity", "students");
    fd.set("file", new File([await wb.xlsx.writeBuffer()], "students.xlsx"));
    const p = await (await admin.call("/api/import/preview", { form: fd })).json();
    expect(p.total).toBe(3);
    expect(p.valid).toBe(1);
    expect(p.rows[1].errors.join(" ")).toMatch(/Duplicate Passport/);
    expect(p.rows[2].errors.join(" ")).toMatch(/Unknown program/);
    const c = await (await admin.call("/api/import/commit", { body: { id: p.id } })).json();
    expect(c.summary.created).toBe(1);
    const [st] = await db`select custom_data from students where student_number = 'TT26IMP001'`;
    expect(st.custom_data.scholarship).toBe("Contract");
  });
  test("grade import: preview shows changes; commit applies through the same rules", async () => {
    const [e] = await db`select st.student_number, c.subject_code, c.academic_year_name, c.semester_number, e.id
      from student_enrollments e join students st on st.id = e.student_id join v_courses c on c.id = e.course_id
      join user_course_assignments a on a.course_id = c.id join users u on u.id = a.user_id and u.username = 'operator'
      where c.is_current and not exists (select 1 from grades g where g.enrollment_id = e.id and g.assessment_type_id = ${ids.atP1} and g.score is not null) limit 1`;
    if (!e) return;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Grades");
    ws.addRow(["Student ID", "Subject Code", "Academic Year", "Semester", "P1"]);
    ws.addRow([e.student_number, e.subject_code, e.academic_year_name, e.semester_number, 6]);
    const fd = new FormData();
    fd.set("entity", "grades");
    fd.set("file", new File([await wb.xlsx.writeBuffer()], "grades.xlsx"));
    const p = await (await operator.call("/api/import/preview", { form: fd })).json();
    expect(p.valid).toBe(1);
    expect(p.rows[0].changes[0]).toMatchObject({ code: "P1", new: 6, kind: "new" });
    const c = await (await operator.call("/api/import/commit", { body: { id: p.id } })).json();
    expect(c.summary.imported).toBe(1);
    const [g] = await db`select score from grades where enrollment_id = ${e.id} and assessment_type_id = ${ids.atP1}`;
    expect(g.score).toBe(6);
  });
  test("Excel exports return valid workbooks", async () => {
    for (const path of ["/api/export/students?status=Active&columns=student_number,last_name,first_name,group_name", `/api/export/grades?course=${ids.opCourse}`]) {
      const r = await admin.call(path);
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toContain("spreadsheetml");
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await r.arrayBuffer());
      expect(wb.worksheets[0].rowCount).toBeGreaterThan(1);
    }
  });
  test("PDF documents are generated", async () => {
    const [sem] = await db`select id from semesters where is_locked limit 1`;
    for (const path of [`/api/pdf/transcript/${ids.studentId}`, `/api/pdf/performance/${ids.studentId}`, `/api/pdf/course/${ids.opCourse}`, `/api/pdf/semester?sem=${sem.id}`]) {
      const r = await admin.call(path);
      expect(r.status).toBe(200);
      const buf = new Uint8Array(await r.arrayBuffer());
      expect(new TextDecoder().decode(buf.slice(0, 5))).toBe("%PDF-");
    }
  });
});

describe("administration", () => {
  test("admin can create a custom role with chosen permissions", async () => {
    const r = await admin.call("/api/admin/roles", { body: { name: `Dean office ${Date.now()}`, description: "test", permissions: ["students.view", "reports.view", "not.a.permission"] } });
    expect(r.status).toBe(200);
    const perms = await db`select permission_code from role_permissions where role_id = ${(await r.json()).id} order by 1`;
    expect(perms.map((p) => p.permission_code)).toEqual(["reports.view", "students.view"]);
  });
  test("grading scheme validation rejects weights that do not total 100", async () => {
    const [s] = await db`select * from grading_schemes where is_default`;
    const r = await admin.call(`/api/admin/grading/${s.id}`, { method: "PUT", body: { name: s.name, pass_mark: 60, min_attendance: 0, retake_cap: null, is_default: true, scale: s.scale,
      components: [{ assessment_type_id: ids.atMID, weight: 50, max_score: 30, min_score: 0 }] } });
    expect(r.status).toBe(400);
  });
  test("encrypted backup can be created", async () => {
    const r = await admin.call("/api/admin/backups", { method: "POST" });
    expect(r.status).toBe(200);
    const { name } = await r.json();
    const dl = await admin.call(`/api/admin/backups/${name}`);
    const head = new TextDecoder().decode(new Uint8Array(await dl.arrayBuffer()).slice(0, 5));
    expect(head).toBe("TTBK1");
  });
});
