import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { PageHeader, Card, Kpi, Empty, Badge } from "@/components/ui";
import { DashboardCharts } from "@/components/dashboard-charts";
import { DashboardFilters } from "@/components/dashboard-filters";
import { flatParams } from "@/lib/format";
import { FileDown } from "lucide-react";

export const dynamic = "force-dynamic";

const n = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : null);

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requirePage();
  const sp = flatParams(await searchParams);
  if (!s.permissions.has("reports.view")) {
    return (
      <>
        <PageHeader title={`Welcome, ${s.user.fullName}`} subtitle={s.user.roleName} />
        <Card><p className="text-sm text-muted">Use the menu to access the sections available to your role.</p></Card>
      </>
    );
  }
  const widgets = new Set((await getSetting("dashboard")).widgets);
  const fac = s.user.facultyId ?? n(sp.faculty);
  const [cur] = await sql`select id, name, academic_year_id from semesters where is_current limit 1`;
  const sem = n(sp.sem);
  const ay = n(sp.ay);
  const curSem = sem ?? cur?.id ?? null;

  const facS = fac ? sql`and s.faculty_id = ${fac}` : sql``;
  const facC = fac ? sql`and c.faculty_id = ${fac}` : sql``;
  const period = sql`${sem ? sql`and c.semester_id = ${sem}` : sql``} ${ay ? sql`and c.academic_year_id = ${ay}` : sql``}`;

  const [k] = await sql`select count(*)::int as total, count(*) filter (where status = 'Active')::int as active,
      count(*) filter (where status = 'Graduated')::int as graduated, count(*) filter (where status in ('Suspended','Withdrawn'))::int as inactive
    from v_students s where deleted_at is null ${facS}`;
  const [g] = await sql`select round(avg(e.final_score) filter (where e.result_status <> 'incomplete'), 1) as avg,
      count(*) filter (where e.result_status = 'passed')::int as passed, count(*) filter (where e.result_status = 'failed')::int as failed,
      count(*) filter (where e.needs_retake)::int as retakes
    from student_enrollments e join v_courses c on c.id = e.course_id where e.status = 'Enrolled' ${facC} ${period}`;
  // "Missing" = an assessment that classmates in the same course already have a mark for, but this student does not.
  const missingCond = sql`exists (select 1 from scheme_components sc where sc.scheme_id = c.grading_scheme_id and sc.weight > 0
      and not exists (select 1 from grades gg where gg.enrollment_id = e.id and gg.assessment_type_id = sc.assessment_type_id and gg.score is not null)
      and exists (select 1 from grades g2 join student_enrollments e2 on e2.id = g2.enrollment_id
                  where e2.course_id = c.id and g2.assessment_type_id = sc.assessment_type_id and g2.score is not null))`;
  const [m] = curSem ? await sql`select count(distinct e.student_id)::int as students, count(*)::int as results
    from student_enrollments e join v_courses c on c.id = e.course_id join students st on st.id = e.student_id
    where e.status = 'Enrolled' and st.status = 'Active' and c.semester_id = ${curSem} ${facC} and ${missingCond}` : [{ students: 0, results: 0 }];
  const [{ pending }] = await sql`select count(*)::int as pending from grade_change_requests where status = 'pending'`;

  const byFaculty = await sql`select coalesce(faculty_code, '—') as name, faculty_name as full, count(*)::int as value from v_students s where deleted_at is null and status = 'Active' ${facS} group by 1, 2 order by 3 desc`;
  const byProgram = await sql`select program_name as name, degree_level, count(*)::int as value from v_students s where deleted_at is null and status = 'Active' ${facS} group by 1, 2 order by 3 desc`;
  const byYear = await sql`select 'Year ' || current_year as name, count(*)::int as value from v_students s where deleted_at is null and status = 'Active' and current_year is not null ${facS} group by current_year order by current_year`;
  const dist = await sql`select e.letter_grade as name, count(*)::int as value from student_enrollments e join v_courses c on c.id = e.course_id
    where e.letter_grade is not null ${facC} ${period} group by 1`;
  const passTrend = await sql`select replace(c.semester_name, ' · Semester ', ' S') as name,
      round(100.0 * count(*) filter (where e.result_status = 'passed') / nullif(count(*) filter (where e.result_status <> 'incomplete'), 0), 1) as pass,
      round(avg(e.final_score) filter (where e.result_status <> 'incomplete'), 1) as avg
    from student_enrollments e join v_courses c on c.id = e.course_id where true ${facC} ${ay ? sql`and c.academic_year_id = ${ay}` : sql``}
    group by c.semester_name, c.academic_year_name, c.semester_number
    having count(*) filter (where e.result_status <> 'incomplete') > 0 order by c.academic_year_name, c.semester_number`;
  const subjects = await sql`select c.subject_code, c.subject_name, count(*)::int as n,
      round(avg(e.final_score) filter (where e.result_status <> 'incomplete'), 1) as avg,
      round(100.0 * count(*) filter (where e.result_status = 'passed') / nullif(count(*) filter (where e.result_status <> 'incomplete'), 0), 0) as pass
    from student_enrollments e join v_courses c on c.id = e.course_id where true ${facC} ${period}
    group by 1, 2 having count(*) filter (where e.result_status <> 'incomplete') >= 5 order by avg asc limit 10`;
  const missing = curSem ? await sql`select st.id, st.student_number, st.last_name || ' ' || st.first_name as name, c.group_name, count(*)::int as courses
    from student_enrollments e join v_courses c on c.id = e.course_id join students st on st.id = e.student_id
    where e.status = 'Enrolled' and st.status = 'Active' and c.semester_id = ${curSem} ${facC} and ${missingCond}
    group by 1, 2, 3, 4 order by courses desc, name limit 8` : [];
  const retakes = await sql`select st.id, st.student_number, st.last_name || ' ' || st.first_name as name, c.subject_name, c.semester_name, e.final_score
    from student_enrollments e join v_courses c on c.id = e.course_id join students st on st.id = e.student_id
    where e.needs_retake ${facC} ${period} order by c.academic_year_name desc, c.semester_number desc, st.last_name limit 8`;

  const filterOpts = {
    years: await sql`select id, name from academic_years order by start_date desc`,
    semesters: await sql`select id, name, academic_year_id from semesters order by start_date desc nulls last`,
    faculties: s.user.facultyId ? [] : await sql`select id, name from faculties order by name`,
  };
  const passRate = g.passed + g.failed ? Math.round((g.passed / (g.passed + g.failed)) * 1000) / 10 : null;
  const reportHref = sem ? `/api/pdf/semester?sem=${sem}${fac ? `&faculty=${fac}` : ""}` : ay ? `/api/pdf/semester?ay=${ay}${fac ? `&faculty=${fac}` : ""}` : cur ? `/api/pdf/semester?ay=${cur.academic_year_id}${fac ? `&faculty=${fac}` : ""}` : null;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={<>Live academic overview{cur ? <> · current semester <b className="text-fg">{cur.name}</b></> : null}{s.user.facultyName ? <> · {s.user.facultyName}</> : null}</>}
        actions={<>
          <DashboardFilters years={[...filterOpts.years] as never} semesters={[...filterOpts.semesters] as never} faculties={[...filterOpts.faculties] as never} />
          {reportHref && <a className="btn" href={reportHref} target="_blank"><FileDown size={16} />PDF report</a>}
        </>}
      />
      {widgets.has("kpis") && (
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Kpi label="Total students" value={k.total.toLocaleString()} hint={`${k.graduated} graduated · ${k.inactive} suspended/withdrawn`} />
          <Kpi label="Active students" value={k.active.toLocaleString()} tone="ok" />
          <Kpi label="Average grade" value={g.avg ?? "—"} hint="completed results, selected period" />
          <Kpi label="Pass rate" value={passRate != null ? `${passRate}%` : "—"} hint={`${g.passed} passed · ${g.failed} failed`} tone={passRate != null && passRate < 75 ? "warn" : "ok"} />
          <Kpi label="Missing grades" value={m.students} hint={`${m.results} course results with missing marks`} tone={m.students ? "warn" : undefined} />
          <Kpi label="Retakes required" value={g.retakes} hint={<Link className="link" href="/approvals">{pending} approvals pending</Link>} tone={g.retakes ? "bad" : undefined} />
        </div>
      )}
      <DashboardCharts
        widgets={[...widgets]}
        byFaculty={[...byFaculty] as never} byProgram={[...byProgram] as never} byYear={[...byYear] as never}
        dist={[...dist] as never} passTrend={[...passTrend] as never}
      />
      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        {widgets.has("subjectPerformance") && (
          <Card title="Lowest-performing subjects" pad={false} className="xl:col-span-1">
            {subjects.length === 0 ? <Empty /> : (
              <div className="scroll-x"><table className="table"><thead><tr><th>Subject</th><th className="text-right">Avg</th><th className="text-right">Pass</th></tr></thead>
                <tbody>{subjects.map((r) => (
                  <tr key={r.subject_code}><td><div className="font-medium">{r.subject_name}</div><div className="text-xs text-muted">{r.subject_code} · {r.n} results</div></td>
                    <td className="text-right tabular">{r.avg}</td><td className="text-right tabular"><Badge tone={r.pass < 75 ? "badge-amber" : "badge-green"}>{r.pass}%</Badge></td></tr>
                ))}</tbody></table></div>
            )}
          </Card>
        )}
        {widgets.has("missing") && (
          <Card title="Students with missing grades" pad={false} actions={<Link className="text-xs link" href={`/courses?missing=1${curSem ? `&sem=${curSem}` : ""}`}>View all</Link>}>
            {missing.length === 0 ? <Empty>No missing marks</Empty> : (
              <ul>{missing.map((r) => (
                <li key={r.id} className="flex items-center justify-between border-b border-line px-5 py-2.5 last:border-0">
                  <div><Link href={`/students/${r.id}`} className="link">{r.name}</Link><div className="text-xs text-muted">{r.student_number} · {r.group_name}</div></div>
                  <Badge tone="badge-amber">{r.courses} course{r.courses > 1 ? "s" : ""}</Badge>
                </li>))}</ul>
            )}
          </Card>
        )}
        {widgets.has("retakes") && (
          <Card title="Students requiring retakes" pad={false} actions={<Link className="text-xs link" href="/students?result=retake">View all</Link>}>
            {retakes.length === 0 ? <Empty>No retakes required</Empty> : (
              <ul>{retakes.map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-3 border-b border-line px-5 py-2.5 last:border-0">
                  <div className="min-w-0"><Link href={`/students/${r.id}`} className="link">{r.name}</Link><div className="truncate text-xs text-muted">{r.subject_name} · {r.semester_name}</div></div>
                  <span className="tabular text-sm text-bad">{r.final_score}</span>
                </li>))}</ul>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
