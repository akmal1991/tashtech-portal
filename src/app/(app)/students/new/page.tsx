import { requirePage } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { StudentForm } from "@/components/student-form";
import { studentFormOptions } from "@/lib/student-form-data";

export const metadata = { title: "New student" };

export default async function NewStudent() {
  const s = await requirePage("students.create");
  const o = await studentFormOptions(s);
  return (
    <>
      <PageHeader back={{ href: "/students", label: "Students" }} title="Register new student" subtitle="Fields marked * are required. Passport and JSHSHIR are stored encrypted." />
      <StudentForm initial={{ study_mode: "Full-time", status: "Active", enrollment_date: new Date().toISOString().slice(0, 10) }}
        programs={o.programs} groups={o.groups} customFields={o.customFields} canSensitive={s.permissions.has("students.view_sensitive")} />
    </>
  );
}
