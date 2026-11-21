import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { sql } from "@/lib/db";
import { studentScope } from "@/lib/academic";
import { PageHeader } from "@/components/ui";
import { StudentForm } from "@/components/student-form";
import { studentFormOptions } from "@/lib/student-form-data";

export const metadata = { title: "Edit student" };

export default async function EditStudent({ params }: { params: Promise<{ id: string }> }) {
  const s = await requirePage("students.edit");
  const id = Number((await params).id);
  const [st] = await sql`select s.* from v_students s where s.id = ${id} and s.deleted_at is null ${studentScope(s)}`;
  if (!st) notFound();
  const o = await studentFormOptions(s);
  const keys = ["student_number", "first_name", "last_name", "middle_name", "date_of_birth", "gender", "program_id", "group_id", "current_year", "current_semester",
    "study_mode", "status", "enrollment_date", "phone", "email", "address", "notes", "custom_data"];
  const initial = Object.fromEntries(keys.map((k) => [k, st[k] ?? ""]));
  return (
    <>
      <PageHeader back={{ href: `/students/${id}`, label: `${st.last_name} ${st.first_name}` }} title="Edit student" subtitle="All changes are written to the audit log." />
      <StudentForm studentId={id} initial={{ ...initial, passport: "", jshshir: "" }} programs={o.programs} groups={o.groups}
        customFields={o.customFields} canSensitive={s.permissions.has("students.view_sensitive")} />
    </>
  );
}
