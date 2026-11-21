import { sql } from "@/lib/db";
import { route, requireIp, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { recomputeCourse } from "@/lib/academic";
import { SchemeBody, checkScheme } from "@/lib/admin-schemas";

type P = { id: string };

// Updating a scheme recalculates results of all courses in UNLOCKED semesters that use it.
// Locked semesters keep their stored results (historical integrity).
export const PUT = route<P>("grading.manage", async (req, s, { id }) => {
  const sid = Number(id);
  const b = SchemeBody.parse(await req.json());
  await checkScheme(b);
  const [before] = await sql`select * from grading_schemes where id = ${sid}`;
  if (!before) throw new ApiError(404, "Scheme not found");
  const recalculated = await sql.begin(async (tx) => {
    if (b.is_default) await tx`update grading_schemes set is_default = false where id <> ${sid}`;
    await tx`update grading_schemes set name = ${b.name}, description = ${b.description ?? null}, pass_mark = ${b.pass_mark}, min_attendance = ${b.min_attendance},
      retake_cap = ${b.retake_cap}, is_default = ${b.is_default}, scale = ${tx.json(b.scale)} where id = ${sid}`;
    const keep = b.components.map((c) => c.assessment_type_id);
    const removed = await tx`select sc.assessment_type_id from scheme_components sc where sc.scheme_id = ${sid} and not (sc.assessment_type_id = any(${keep}))
      and exists (select 1 from grades g join student_enrollments e on e.id = g.enrollment_id join courses c on c.id = e.course_id
                  where c.grading_scheme_id = ${sid} and g.assessment_type_id = sc.assessment_type_id and g.score is not null)`;
    if (removed.length) throw new ApiError(409, "Cannot remove a component that already has recorded marks; set its weight to 0 instead");
    await tx`delete from scheme_components where scheme_id = ${sid} and not (assessment_type_id = any(${keep}))`;
    for (const c of b.components) {
      await tx`insert into scheme_components (scheme_id, assessment_type_id, weight, max_score, min_score) values (${sid}, ${c.assessment_type_id}, ${c.weight}, ${c.max_score}, ${c.min_score})
        on conflict (scheme_id, assessment_type_id) do update set weight = excluded.weight, max_score = excluded.max_score, min_score = excluded.min_score`;
    }
    const courses = await tx`select c.id from courses c join semesters s on s.id = c.semester_id where c.grading_scheme_id = ${sid} and not s.is_locked`;
    let n = 0;
    for (const c of courses) n += await recomputeCourse(c.id, tx);
    return n;
  });
  await audit(s.user.id, "GRADING_SCHEME_UPDATED", "grading_scheme", sid, { before: { pass_mark: before.pass_mark, scale: before.scale }, after: b, recalculated }, requireIp(req));
  return { ok: true, recalculated };
});
