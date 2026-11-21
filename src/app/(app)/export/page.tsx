import { requirePage } from "@/lib/auth";
import { sql } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { ExportBuilder } from "./export-builder";

export const metadata = { title: "Export" };

export default async function ExportPage() {
  const s = await requirePage("export.run");
  const opts = {
    faculties: s.user.facultyId ? [] : [...await sql`select id, name from faculties order by name`],
    programs: [...await sql`select id, name || ' (' || degree_level || ')' as name from programs order by name`],
    groups: [...await sql`select id, name from student_groups order by name`],
    years: [...await sql`select id, name from academic_years order by start_date desc`],
    semesters: [...await sql`select id, name from semesters order by start_date desc nulls last`],
    subjects: [...await sql`select id, code || ' — ' || name as name from subjects order by code`],
    custom: [...await sql`select field_key, label from custom_fields where entity = 'student' and is_active order by sort_order`],
  };
  return (
    <>
      <PageHeader title="Export data" subtitle="Build formatted Excel exports with filters and your choice of columns. Every export is logged." />
      <ExportBuilder {...(opts as unknown as Omit<React.ComponentProps<typeof ExportBuilder>, "canSensitive" | "canGrades">)} canSensitive={s.permissions.has("students.view_sensitive")} canGrades={s.permissions.has("grades.view")} />
    </>
  );
}
