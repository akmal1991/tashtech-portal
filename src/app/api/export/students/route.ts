import { sql } from "@/lib/db";
import { route, requireIp } from "@/lib/api";
import { audit } from "@/lib/audit";
import { decrypt } from "@/lib/crypto";
import { buildWorkbook, xlsxResponse } from "@/lib/excel";
import { STUDENT_COLUMNS } from "@/lib/export-columns";
import { orderBy, parseFilters, studentWhere } from "@/lib/student-query";
import { getSetting } from "@/lib/settings";

export const GET = route("export.run", async (req, s) => {
  const sp = req.nextUrl.searchParams;
  const f = parseFilters(sp);
  const canSensitive = s.permissions.has("students.view_sensitive");
  const requested = sp.get("columns")?.split(",").filter(Boolean);
  const cols = STUDENT_COLUMNS.filter((c) => (requested ? requested.includes(c.key) : "default" in c && c.default))
    .filter((c) => !("sensitive" in c) || canSensitive);
  const custom = await sql`select field_key, label, field_type from custom_fields where entity = 'student' and is_active order by sort_order`;
  const customCols = custom.filter((c) => !requested || requested.includes("custom:" + c.field_key));

  const rows = await sql`
    select s.*, (select round(sum(e.grade_point * c.credits) / nullif(sum(c.credits), 0), 2)
                 from student_enrollments e join v_courses c on c.id = e.course_id
                 where e.student_id = s.id and e.result_status <> 'incomplete') as gpa
    from v_students s ${studentWhere(s, f)} order by ${orderBy(sp.get("sort") ?? undefined, sp.get("dir") ?? undefined)} limit 20000`;
  const data = rows.map((r) => {
    const o: Record<string, unknown> = {};
    for (const c of cols) o[c.key] = c.key === "passport" ? decrypt(r.passport_enc) : c.key === "jshshir" ? decrypt(r.jshshir_enc) : r[c.key];
    for (const c of customCols) { const v = r.custom_data?.[c.field_key]; o["custom:" + c.field_key] = c.field_type === "checkbox" ? (v ? "Yes" : "No") : v ?? ""; }
    return o;
  });
  const { primaryColor } = await getSetting("branding");
  const buf = await buildWorkbook([{
    name: "Students",
    columns: [...cols.map((c) => ({ header: c.header, key: c.key })), ...customCols.map((c) => ({ header: c.label as string, key: "custom:" + c.field_key }))],
    rows: data,
  }], primaryColor);
  await sql`insert into import_export_history (kind, entity, file_name, rows_total, rows_ok, user_id) values ('export', 'students', 'students.xlsx', ${data.length}, ${data.length}, ${s.user.id})`;
  await audit(s.user.id, "EXPORT_STUDENTS", "export", null, { rows: data.length, filters: f, columns: cols.map((c) => c.key), sensitive: cols.some((c) => "sensitive" in c) }, requireIp(req));
  return xlsxResponse(buf, `students-${new Date().toISOString().slice(0, 10)}.xlsx`);
});
