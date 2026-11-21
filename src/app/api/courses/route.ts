import { z } from "zod";
import { sql } from "@/lib/db";
import { route, requireIp } from "@/lib/api";
import { audit } from "@/lib/audit";

const Body = z.object({
  subject_id: z.number().int().positive(),
  semester_id: z.number().int().positive(),
  group_id: z.number().int().positive().nullable(),
  instructor: z.string().trim().max(120).nullable().optional(),
  grading_scheme_id: z.number().int().positive(),
  enroll_group: z.boolean().default(true),
});

export const POST = route("courses.manage", async (req, s) => {
  const b = Body.parse(await req.json());
  const id = await sql.begin(async (tx) => {
    const [c] = await tx`insert into courses (subject_id, semester_id, group_id, instructor, grading_scheme_id)
      values (${b.subject_id}, ${b.semester_id}, ${b.group_id}, ${b.instructor ?? null}, ${b.grading_scheme_id}) returning id`;
    if (b.enroll_group && b.group_id) {
      await tx`insert into student_enrollments (student_id, course_id)
        select id, ${c.id} from students where group_id = ${b.group_id} and status = 'Active' and deleted_at is null`;
    }
    return c.id as number;
  });
  await audit(s.user.id, "COURSE_CREATED", "course", id, b, requireIp(req));
  return { id };
});
