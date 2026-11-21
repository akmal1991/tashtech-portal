import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { sql } from "@/lib/db";
import { courseScope } from "@/lib/academic";
import { PageHeader, Badge, Empty, Pagination, Select } from "@/components/ui";
import { AutoForm } from "@/components/auto-form";
import { CreateCourseButton } from "./course-create";
import { flatParams, qs } from "@/lib/format";
import { Lock, CheckCircle2, Search } from "lucide-react";

export const metadata = { title: "Courses & Grades" };
const PER = 30;
const n = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : null);

export default async function CoursesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requirePage("grades.view");
  const sp = flatParams(await searchParams);
  const [cur] = await sql`select id from semesters where is_current limit 1`;
  const sem = sp.sem === "all" ? null : n(sp.sem) ?? cur?.id ?? null;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.trim();
  const where = sql`where true ${courseScope(s)}
    ${sem ? sql`and c.semester_id = ${sem}` : sql``}
    ${n(sp.group) ? sql`and c.group_id = ${n(sp.group)}` : sql``}
    ${n(sp.faculty) ? sql`and c.faculty_id = ${n(sp.faculty)}` : sql``}
    ${q ? sql`and (c.subject_name ilike ${"%" + q + "%"} or c.subject_code ilike ${"%" + q + "%"} or c.instructor ilike ${"%" + q + "%"} or c.group_name ilike ${"%" + q + "%"})` : sql``}
    ${sp.missing ? sql`and exists (select 1 from student_enrollments e join scheme_components sc on sc.scheme_id = c.grading_scheme_id and sc.weight > 0
        where e.course_id = c.id and e.status = 'Enrolled'
        and not exists (select 1 from grades g where g.enrollment_id = e.id and g.assessment_type_id = sc.assessment_type_id and g.score is not null)
        and exists (select 1 from grades g2 join student_enrollments e2 on e2.id = g2.enrollment_id where e2.course_id = c.id and g2.assessment_type_id = sc.assessment_type_id and g2.score is not null))` : sql``}`;
  const [{ total }] = await sql`select count(*)::int as total from v_courses c ${where}`;
  const rows = await sql`
    select c.*, st.students, st.done, st.avg, st.passed, st.failed
    from v_courses c
    left join lateral (select count(*)::int as students, count(*) filter (where e.result_status <> 'incomplete')::int as done,
        round(avg(e.final_score), 1) as avg, count(*) filter (where e.result_status = 'passed')::int as passed, count(*) filter (where e.result_status = 'failed')::int as failed
      from student_enrollments e where e.course_id = c.id and e.status = 'Enrolled') st on true
    ${where} order by c.academic_year_name desc, c.semester_number desc, c.group_name, c.subject_code limit ${PER} offset ${(page - 1) * PER}`;
  const semesters = await sql`select id, name from semesters order by start_date desc nulls last`;
  const groups = await sql`select id, name from student_groups order by name`;
  const faculties = s.user.facultyId ? [] : await sql`select id, name from faculties order by name`;
  const canManage = s.permissions.has("courses.manage");
  const createOpts = canManage ? {
    subjects: [...await sql`select id, code || ' — ' || name as name from subjects order by code`],
    semesters: [...semesters], groups: [...groups],
    schemes: [...await sql`select id, name, is_default from grading_schemes order by is_default desc, name`],
  } : null;
  const base = { sem: sp.sem, group: sp.group, faculty: sp.faculty, q: sp.q, missing: sp.missing };

  return (
    <>
      <PageHeader title="Courses & Grades" subtitle={s.permissions.has("grades.all_courses") ? "All course offerings" : "Courses assigned to you"}
        actions={createOpts && <CreateCourseButton {...(createOpts as unknown as React.ComponentProps<typeof CreateCourseButton>)} />} />
      <div className="card mb-4 p-4">
        <AutoForm className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
          <div className="relative col-span-2">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <input name="q" defaultValue={sp.q} className="input pl-9" placeholder="Subject, code, instructor, group" />
          </div>
          <select name="sem" defaultValue={sp.sem ?? ""} className="input">
            <option value="">Current semester</option><option value="all">All semesters</option>
            {semesters.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <Select name="group" value={sp.group} options={groups.map((g) => ({ value: g.id, label: g.name }))} placeholder="All groups" />
          {faculties.length > 0 && <Select name="faculty" value={sp.faculty} options={faculties.map((g) => ({ value: g.id, label: g.name }))} placeholder="All faculties" />}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="missing" value="1" defaultChecked={!!sp.missing} />Only with missing marks</label>
        </AutoForm>
      </div>
      <div className="card overflow-hidden">
        {rows.length === 0 ? <Empty>No courses found</Empty> : (
          <div className="scroll-x">
            <table className="table">
              <thead><tr><th>Subject</th><th>Group</th><th className="hidden md:table-cell">Semester</th><th className="hidden lg:table-cell">Instructor</th>
                <th className="text-right">Students</th><th>Progress</th><th className="text-right">Avg</th><th className="text-right">Pass</th><th>Status</th></tr></thead>
              <tbody>{rows.map((c) => {
                const pct = c.students ? Math.round((c.done / c.students) * 100) : 0;
                return (
                  <tr key={c.id}>
                    <td><Link href={`/courses/${c.id}`} className="link">{c.subject_name}</Link><div className="text-xs text-muted">{c.subject_code} · {c.ects} ECTS</div></td>
                    <td className="whitespace-nowrap">{c.group_name ?? "—"}</td>
                    <td className="hidden whitespace-nowrap text-xs md:table-cell">{c.semester_name}</td>
                    <td className="hidden lg:table-cell">{c.instructor ?? "—"}</td>
                    <td className="text-right tabular">{c.students}</td>
                    <td className="min-w-28"><div className="h-1.5 w-full rounded-full bg-surface-2"><div className="h-1.5 rounded-full bg-brand" style={{ width: `${pct}%` }} /></div><div className="mt-1 text-xs text-muted">{pct}% final</div></td>
                    <td className="text-right tabular">{c.avg ?? "—"}</td>
                    <td className="text-right tabular">{c.passed + c.failed ? `${Math.round((c.passed / (c.passed + c.failed)) * 100)}%` : "—"}</td>
                    <td className="whitespace-nowrap">{c.is_locked ? <Badge tone="badge-gray"><Lock size={11} />Locked</Badge> : c.submitted_at ? <Badge tone="badge-green"><CheckCircle2 size={11} />Submitted</Badge> : <Badge tone="badge-blue">Open</Badge>}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pages={Math.ceil(total / PER)} total={total} href={(p) => `/courses${qs(base, { page: p })}`} />
      </div>
    </>
  );
}
