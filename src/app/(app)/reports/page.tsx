import { requirePage } from "@/lib/auth";
import { sql } from "@/lib/db";
import { courseScope } from "@/lib/academic";
import { PageHeader, Card, Badge } from "@/components/ui";
import { ReportBuilder } from "./report-builder";

export const metadata = { title: "Reports & PDF" };

export default async function ReportsPage() {
  const s = await requirePage("reports.view");
  const years = await sql`select id, name from academic_years order by start_date desc`;
  const semesters = await sql`select id, name from semesters order by start_date desc nulls last`;
  const faculties = s.user.facultyId ? [] : await sql`select id, name from faculties order by name`;
  const groups = await sql`select id, name from student_groups order by name`;
  const courses = await sql`select c.id, c.subject_code || ' · ' || coalesce(c.group_name, '') || ' · ' || c.semester_name as name from v_courses c where true ${courseScope(s)}
    order by c.academic_year_name desc, c.semester_number desc, c.group_name, c.subject_code limit 500`;
  const perf = await sql`select c.subject_code, c.subject_name, count(*)::int as results, round(avg(e.final_score), 1) as avg,
      round(100.0 * count(*) filter (where e.result_status = 'passed') / nullif(count(*), 0), 0) as pass,
      count(*) filter (where e.letter_grade = 'A')::int as a, count(*) filter (where e.needs_retake)::int as retakes
    from student_enrollments e join v_courses c on c.id = e.course_id where e.result_status <> 'incomplete' ${courseScope(s)}
    group by 1, 2 order by avg desc`;
  return (
    <>
      <PageHeader title="Reports & PDF documents" subtitle="Official PDF documents and academic performance statistics." />
      <ReportBuilder years={[...years] as never} semesters={[...semesters] as never} faculties={[...faculties] as never} groups={[...groups] as never} courses={[...courses] as never} />
      <Card className="mt-5" title="Subject performance statistics (all completed results)" pad={false}>
        <div className="scroll-x max-h-[520px] overflow-y-auto"><table className="table">
          <thead><tr><th>Code</th><th>Subject</th><th className="text-right">Results</th><th className="text-right">Average</th><th className="text-right">Pass rate</th><th className="text-right">A grades</th><th className="text-right">Retakes</th></tr></thead>
          <tbody>{perf.map((r) => (
            <tr key={r.subject_code}><td className="font-mono text-xs">{r.subject_code}</td><td>{r.subject_name}</td><td className="text-right tabular">{r.results}</td>
              <td className="text-right tabular">{r.avg}</td><td className="text-right"><Badge tone={r.pass < 75 ? "badge-amber" : "badge-green"}>{r.pass}%</Badge></td>
              <td className="text-right tabular">{r.a}</td><td className="text-right tabular">{r.retakes}</td></tr>))}</tbody>
        </table></div>
      </Card>
    </>
  );
}
