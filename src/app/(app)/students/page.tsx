import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { sql } from "@/lib/db";
import { PageHeader, Badge, Empty, Pagination, Select } from "@/components/ui";
import { AutoForm } from "@/components/auto-form";
import { orderBy, parseFilters, studentWhere } from "@/lib/student-query";
import { flatParams, qs } from "@/lib/format";
import { ArrowDown, ArrowUp, Download, Plus, Archive, Search } from "lucide-react";

export const metadata = { title: "Students" };
const PER = 25;

export default async function StudentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requirePage("students.view");
  const sp = flatParams(await searchParams);
  const f = parseFilters(sp);
  const page = Math.max(1, Number(sp.page) || 1);
  const where = studentWhere(s, f);
  const [{ total }] = await sql`select count(*)::int as total from v_students s ${where}`;
  const rows = await sql`
    select s.id, s.student_number, s.first_name, s.last_name, s.middle_name, s.group_name, s.program_name, s.degree_level, s.faculty_code,
           s.current_year, s.current_semester, s.status, s.study_mode, s.deleted_at,
           (select round(sum(e.grade_point * c.credits) / nullif(sum(c.credits), 0), 2) from student_enrollments e join v_courses c on c.id = e.course_id
            where e.student_id = s.id and e.result_status <> 'incomplete') as gpa
    from v_students s ${where} order by ${orderBy(sp.sort, sp.dir)} limit ${PER} offset ${(page - 1) * PER}`;

  const scopeFac = s.user.facultyId ? sql`where d.faculty_id = ${s.user.facultyId}` : sql``;
  const [faculties, programs, groups, subjects, years, semesters] = await Promise.all([
    s.user.facultyId ? sql`select id, name from faculties where id = ${s.user.facultyId}` : sql`select id, name from faculties order by name`,
    sql`select p.id, p.name || ' (' || p.degree_level || ')' as name from programs p join departments d on d.id = p.department_id ${scopeFac} order by p.name`,
    sql`select g.id, g.name from student_groups g join programs p on p.id = g.program_id join departments d on d.id = p.department_id ${scopeFac} ${f.program ? sql`${s.user.facultyId ? sql`and` : sql`where`} g.program_id = ${Number(f.program)}` : sql``} order by g.name`,
    sql`select id, code || ' — ' || name as name from subjects order by code`,
    sql`select id, name from academic_years order by start_date desc`,
    sql`select id, name from semesters order by start_date desc nulls last`,
  ]);
  const opt = (rows: { id: number; name: string }[]) => rows.map((r) => ({ value: r.id, label: r.name }));
  const base = { ...f, sort: sp.sort, dir: sp.dir } as Record<string, string | undefined>;
  const sortLink = (key: string) => qs(base, { sort: key, dir: sp.sort === key && sp.dir !== "desc" ? "desc" : "asc", page: undefined });
  const SortTh = ({ k, children, className }: { k: string; children: React.ReactNode; className?: string }) => (
    <th className={className}><Link href={`/students${sortLink(k)}`} className="inline-flex items-center gap-1 hover:text-fg">{children}
      {(sp.sort ?? "name") === k && (sp.dir === "desc" ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}</Link></th>
  );
  const exportQs = qs(f as Record<string, string>, { sort: sp.sort, dir: sp.dir });

  return (
    <>
      <PageHeader
        title={f.archived ? "Archived students" : "Students"}
        subtitle={`${total.toLocaleString()} matching record(s)`}
        actions={<>
          {s.permissions.has("students.delete") && <Link className="btn" href={f.archived ? "/students" : "/students?archived=1"}><Archive size={16} />{f.archived ? "Active records" : "Archive"}</Link>}
          {s.permissions.has("export.run") && <a className="btn" href={`/api/export/students${exportQs}`}><Download size={16} />Export Excel</a>}
          {s.permissions.has("students.create") && <Link className="btn btn-primary" href="/students/new"><Plus size={16} />New student</Link>}
        </>}
      />
      <div className="card mb-4 p-4">
        <AutoForm className="grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-6" keep={f.archived ? [["archived", "1"]] : []}>
          <div className="relative col-span-2">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <input name="q" defaultValue={f.q} className="input pl-9" placeholder={s.permissions.has("students.view_sensitive") ? "Name, student ID, email, passport or JSHSHIR" : "Name, student ID or email"} />
          </div>
          {!s.user.facultyId && <Select name="faculty" value={f.faculty} options={opt(faculties as never)} placeholder="All faculties" />}
          <Select name="program" value={f.program} options={opt(programs as never)} placeholder="All programs" />
          <Select name="group" value={f.group} options={opt(groups as never)} placeholder="All groups" />
          <Select name="status" value={f.status} options={["Active", "Graduated", "Suspended", "Withdrawn"].map((v) => ({ value: v, label: v }))} placeholder="Any status" />
          <Select name="degree" value={f.degree} options={["Bachelor", "Master", "PhD"].map((v) => ({ value: v, label: v }))} placeholder="Any degree" />
          <Select name="year" value={f.year} options={[1, 2, 3, 4, 5, 6].map((v) => ({ value: v, label: `Year ${v}` }))} placeholder="Any year" />
          <Select name="semester" value={f.semester} options={Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `Semester ${i + 1}` }))} placeholder="Any semester" />
          <Select name="mode" value={f.mode} options={["Full-time", "Part-time"].map((v) => ({ value: v, label: v }))} placeholder="Any study mode" />
          <Select name="subject" value={f.subject} options={opt(subjects as never)} placeholder="Any subject" />
          <Select name="ay" value={f.ay} options={opt(years as never)} placeholder="Any academic year" />
          <Select name="sem" value={f.sem} options={opt(semesters as never)} placeholder="Any term" />
          <Select name="grade" value={f.grade} options={["A", "B+", "B", "C+", "C", "D", "F"].map((v) => ({ value: v, label: `Grade ${v}` }))} placeholder="Any grade" />
          <Select name="result" value={f.result} options={[{ value: "passed", label: "Has passed result" }, { value: "failed", label: "Has failed result" }, { value: "incomplete", label: "Has incomplete result" }, { value: "retake", label: "Requires retake" }]} placeholder="Any result" />
          <div className="col-span-2 flex gap-2 md:col-span-1">
            <button className="btn btn-primary flex-1">Search</button>
            <Link className="btn" href={f.archived ? "/students?archived=1" : "/students"}>Reset</Link>
          </div>
        </AutoForm>
      </div>
      <div className="card overflow-hidden">
        {rows.length === 0 ? <Empty>No students match these filters</Empty> : (
          <div className="scroll-x">
            <table className="table">
              <thead><tr>
                <SortTh k="id">Student ID</SortTh><SortTh k="name">Name</SortTh><SortTh k="group">Group</SortTh>
                <SortTh k="program" className="hidden md:table-cell">Program</SortTh><SortTh k="faculty" className="hidden lg:table-cell">Faculty</SortTh>
                <SortTh k="year">Year</SortTh><th className="text-right">GPA</th><SortTh k="status">Status</SortTh>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="tabular font-mono text-xs">{r.student_number}</td>
                    <td><Link href={`/students/${r.id}`} className="link">{r.last_name} {r.first_name}</Link><div className="text-xs text-muted">{r.middle_name}</div></td>
                    <td className="whitespace-nowrap">{r.group_name ?? "—"}</td>
                    <td className="hidden md:table-cell"><div>{r.program_name}</div><div className="text-xs text-muted">{r.degree_level} · {r.study_mode}</div></td>
                    <td className="hidden lg:table-cell">{r.faculty_code}</td>
                    <td className="whitespace-nowrap tabular">{r.current_year ?? "—"} / {r.current_semester ?? "—"}</td>
                    <td className="text-right tabular">{r.gpa?.toFixed(2) ?? "—"}</td>
                    <td>{r.deleted_at ? <Badge tone="badge-red">Archived</Badge> : <Badge>{r.status}</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pages={Math.ceil(total / PER)} total={total} href={(p) => `/students${qs(base, { page: p })}`} />
      </div>
    </>
  );
}
