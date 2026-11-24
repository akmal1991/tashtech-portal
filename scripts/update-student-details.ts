/* Fills in missing details for existing students from the full first-year spreadsheet
 * (T/r | Photo | Full Name | ID Matricula | Passport | Issuing authority | PINFL | Date of Birth | … 33 columns).
 *
 *   bun scripts/update-student-details.ts "<file.xlsx>"          # dry run: report only
 *   bun scripts/update-student-details.ts "<file.xlsx>" --apply  # write changes
 *
 * Students are matched by ID Matricula and the passport number must agree with the stored one.
 * Standard fields go to their columns (PINFL/JSHSHIR encrypted); the rest become custom fields.
 * Never commit the spreadsheet: it contains personal data. */
import postgres from "postgres";
import ExcelJS from "exceljs";
import { encrypt, decrypt, blindIndex, normalizeId } from "../src/lib/crypto";

const file = process.argv[2];
const apply = process.argv.includes("--apply");
if (!file) { console.error('Usage: bun scripts/update-student-details.ts "<file.xlsx>" [--apply]'); process.exit(1); }

// Custom fields created for the extra columns (header regex -> field)
const CUSTOM: { key: string; label: string; type: "text" | "number"; header: RegExp }[] = [
  { key: "passport_issued", label: "Passport issued by / date", type: "text", header: /issuing authority/i },
  { key: "parents_phone", label: "Parents' phone", type: "text", header: /parents.? phone/i },
  { key: "previous_school", label: "Previous educational institution", type: "text", header: /educational institution/i },
  { key: "nationality", label: "Nationality", type: "text", header: /^nationality/i },
  { key: "birth_region", label: "Place of birth (region)", type: "text", header: /place of birth/i },
  { key: "social_background", label: "Social background", type: "text", header: /social background/i },
  { key: "marital_status", label: "Marital status", type: "text", header: /marital status/i },
  { key: "residence_region", label: "Permanent residence (region)", type: "text", header: /permanent residence.*region only/i },
  { key: "tashkent_address", label: "Place of residence in Tashkent", type: "text", header: /place of residence in tashkent/i },
  { key: "tashkent_district", label: "Temporary residence district (Tashkent)", type: "text", header: /temporary residence/i },
  { key: "accommodation", label: "Accommodation in Tashkent", type: "text", header: /^accommodation/i },
  { key: "father_name", label: "Father's full name", type: "text", header: /father.s full name/i },
  { key: "father_birth", label: "Father's place and date of birth", type: "text", header: /father.s place and date/i },
  { key: "father_work", label: "Father's workplace and position", type: "text", header: /father.s place of employment/i },
  { key: "mother_name", label: "Mother's full name", type: "text", header: /mother.s full name/i },
  { key: "mother_birth", label: "Mother's place and date of birth", type: "text", header: /mother.s place and date/i },
  { key: "mother_work", label: "Mother's workplace and position", type: "text", header: /mother.s place of employment/i },
  { key: "parents_address", label: "Parents' permanent address", type: "text", header: /parents.? permanent residence/i },
  { key: "children_in_family", label: "Number of children in family", type: "number", header: /number of children/i },
];
const CORE: Record<string, RegExp> = {
  name: /^full name$/i, id: /id matricula/i, passport: /passport details \(series/i, pinfl: /pinfl|personal identification/i,
  dob: /date of birth/i, mode: /form of study/i, phone: /^phone number/i, gender: /^gender/i, address: /permanent residence.*full address/i,
};

const t = (v: ExcelJS.CellValue): string => {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as { richText?: { text: string }[]; text?: string; result?: unknown };
    return String(o.richText?.map((r) => r.text).join("") ?? o.text ?? o.result ?? "").trim();
  }
  return String(v).trim();
};
const empty = (s: string) => !s || /^topilmadi$/i.test(s) || s === "-";
const toDate = (s: string): string | null => {
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (m) return s;
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/); if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
};
const phone = (s: string): string => {
  const d = s.replace(/\D/g, "");
  const n = d.length === 9 ? "998" + d : d;
  return /^998\d{9}$/.test(n) ? `+998 ${n.slice(3, 5)} ${n.slice(5, 8)} ${n.slice(8, 10)} ${n.slice(10)}` : s;
};

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
const ws = wb.worksheets[0];
let hr = 0;
ws.eachRow((r, i) => { if (!hr) for (let c = 1; c <= ws.columnCount; c++) if (/id matricula/i.test(t(r.getCell(c).value))) hr = i; });
if (!hr) { console.error('No header row with "ID Matricula" found'); process.exit(1); }
const headers = Array.from({ length: ws.columnCount }, (_, c) => t(ws.getRow(hr).getCell(c + 1).value));
const col = (re: RegExp) => headers.findIndex((h) => re.test(h)) + 1;
const coreCol = Object.fromEntries(Object.entries(CORE).map(([k, re]) => [k, col(re)]));
const missingCols = [...Object.entries(coreCol).filter(([, c]) => !c).map(([k]) => k), ...CUSTOM.filter((f) => !col(f.header)).map((f) => f.key)];
if (missingCols.length) { console.error("Columns not found: " + missingCols.join(", ")); process.exit(1); }

const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
try {
  const db = await sql`select id, student_number, first_name, last_name, middle_name, passport_enc, jshshir_hash, gender, custom_data from students where deleted_at is null`;
  const byNum = new Map(db.map((s) => [s.student_number as string, s]));
  const problems: string[] = [];
  const warnings: string[] = [];
  const updates: { id: number; num: string; row: Record<string, unknown>; custom: Record<string, unknown>; changed: string[] }[] = [];
  const seenPinfl = new Map<string, string>();

  ws.eachRow((r, i) => {
    if (i <= hr) return;
    const get = (c: number) => t(r.getCell(c).value);
    const num = get(coreCol.id).toUpperCase();
    if (!num) return;
    const st = byNum.get(num);
    if (!st) { problems.push(`row ${i}: ${num} is not in the database`); return; }
    const pp = normalizeId(get(coreCol.passport));
    if (decrypt(st.passport_enc) !== pp) { problems.push(`row ${i}: ${num} passport differs from the stored one — skipped`); return; }

    const row: Record<string, unknown> = {};
    const changed: string[] = [];
    const pinfl = normalizeId(get(coreCol.pinfl));
    if (!empty(pinfl)) {
      if (!/^\d{14}$/.test(pinfl)) warnings.push(`row ${i}: ${num} PINFL is not 14 digits — not stored`);
      else if (seenPinfl.has(pinfl)) problems.push(`row ${i}: ${num} PINFL duplicates ${seenPinfl.get(pinfl)}`);
      else { seenPinfl.set(pinfl, num); row.jshshir_enc = encrypt(pinfl); row.jshshir_hash = blindIndex(pinfl); changed.push("jshshir"); }
    }
    const dobRaw = get(coreCol.dob);
    if (!empty(dobRaw)) {
      const d = toDate(dobRaw);
      if (!d) warnings.push(`row ${i}: ${num} date of birth "${dobRaw}" not recognised`); else { row.date_of_birth = d; changed.push("date_of_birth"); }
    }
    const g = get(coreCol.gender);
    const fileGender = /^male$/i.test(g) ? "Male" : /^female$/i.test(g) ? "Female" : null;
    const tail = String(st.middle_name ?? "");
    const nameGender = /o.g.l[il]$/i.test(tail) ? "Male" : /qizi$/i.test(tail) ? "Female" : null;
    if (fileGender && nameGender && fileGender !== nameGender) warnings.push(`row ${i}: ${num} gender column says ${fileGender}, patronymic says ${nameGender} — using patronymic`);
    const gender = nameGender ?? fileGender;
    if (gender) { row.gender = gender; changed.push("gender"); }
    const mode = get(coreCol.mode);
    if (/part/i.test(mode)) row.study_mode = "Part-time"; else if (/full/i.test(mode)) row.study_mode = "Full-time";
    const ph = get(coreCol.phone); if (!empty(ph)) { row.phone = phone(ph); changed.push("phone"); }
    const addr = get(coreCol.address); if (!empty(addr)) { row.address = addr; changed.push("address"); }

    const custom: Record<string, unknown> = {};
    for (const f of CUSTOM) {
      let v: string | number = get(col(f.header));
      if (empty(v)) continue;
      if (f.key === "parents_phone") v = phone(v);
      if (f.type === "number") { const n = Number(v); if (Number.isNaN(n)) continue; v = n; }
      custom[f.key] = v;
    }
    if (typeof custom.accommodation === "string") custom.dormitory = /turar joy|yotoqxona|dormitory/i.test(custom.accommodation);
    changed.push(...Object.keys(custom));
    updates.push({ id: st.id, num, row, custom, changed });
  });

  // Name fixes: patronymic ending typed as "O‘g‘ll" -> "O‘g‘li"
  const nameFixes = db.filter((s) => /o(.)g(.)ll$/i.test(String(s.middle_name ?? "")));
  // PINFL already used by a different student in the database?
  for (const u of updates) {
    const h = u.row.jshshir_hash as string | undefined;
    const other = h && db.find((s) => s.jshshir_hash === h && s.id !== u.id);
    if (other) problems.push(`${u.num}: PINFL already belongs to ${other.student_number}`);
  }

  const notInFile = db.filter((s) => !updates.some((u) => u.id === s.id)).map((s) => s.student_number);
  console.log(`Matched ${updates.length} of ${db.length} students. Not in file: ${notInFile.length ? notInFile.join(", ") : "none"}.`);
  const count = (k: string) => updates.filter((u) => u.changed.includes(k)).length;
  console.log(`Will set: JSHSHIR ${count("jshshir")}, date of birth ${count("date_of_birth")}, gender ${count("gender")}, phone ${count("phone")}, address ${count("address")}; ${CUSTOM.length} custom fields (${CUSTOM.map((f) => `${f.key}:${count(f.key)}`).join(", ")}).`);
  console.log(`Name fixes (O‘g‘ll → O‘g‘li): ${nameFixes.map((s) => `${s.student_number} "${s.middle_name}"`).join(", ") || "none"}`);
  if (warnings.length) console.log("Warnings:\n  " + warnings.join("\n  "));
  if (problems.length) { console.error("Problems — nothing written:\n  " + problems.join("\n  ")); process.exit(1); }
  if (!apply) { console.log("\nDry run only. Re-run with --apply to write."); process.exit(0); }

  const [{ admin }] = await sql`select id as admin from users where username = 'admin'`;
  await sql.begin(async (tx) => {
    for (const [i, f] of CUSTOM.entries()) {
      await tx`insert into custom_fields (entity, field_key, label, field_type, sort_order) values ('student', ${f.key}, ${f.label}, ${f.type}, ${10 + i})
        on conflict (entity, field_key) do update set label = excluded.label, field_type = excluded.field_type, is_active = true`;
    }
    for (const u of updates) {
      await tx`update students set ${tx({ ...u.row, updated_at: new Date() } as never)}, custom_data = custom_data || ${tx.json(u.custom as never)} where id = ${u.id}`;
      await tx`insert into audit_logs (user_id, action, entity, entity_id, details) values (${admin}, 'STUDENT_UPDATED', 'student', ${String(u.id)},
        ${tx.json({ source: "spreadsheet import", fields: u.changed })})`;
    }
    for (const s of nameFixes) {
      const fixed = String(s.middle_name).replace(/o(.)g(.)ll$/i, "O$1g$2li");
      await tx`update students set middle_name = ${fixed}, gender = 'Male', updated_at = now() where id = ${s.id}`;
      await tx`insert into audit_logs (user_id, action, entity, entity_id, details) values (${admin}, 'STUDENT_UPDATED', 'student', ${String(s.id)},
        ${tx.json({ changes: { middle_name: { from: s.middle_name, to: fixed } }, reason: "Typo fix O‘g‘ll → O‘g‘li" })})`;
    }
  });
  console.log(`Applied: ${updates.length} students updated, ${nameFixes.length} name fix(es), ${CUSTOM.length} custom fields ensured.`);
} finally {
  await sql.end();
}
