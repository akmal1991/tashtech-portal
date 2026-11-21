import { z } from "zod";
import { sql } from "@/lib/db";
import { route, requireIp } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getAccessibleCourse } from "@/lib/academic";

export const POST = route<{ id: string }>("courses.manage", async (req, s, { id }) => {
  const c = await getAccessibleCourse(s, Number(id));
  const b = z.object({ studentIds: z.array(z.number().int()).default([]), groupId: z.number().int().optional() }).parse(await req.json());
  let ids = b.studentIds;
  if (b.groupId) {
    const rows = await sql`select id from students where group_id = ${b.groupId} and status = 'Active' and deleted_at is null`;
    ids = [...ids, ...rows.map((r) => r.id as number)];
  }
  if (!ids.length) return { added: 0 };
  const added = await sql`insert into student_enrollments ${sql(ids.map((sid) => ({ student_id: sid, course_id: c.id })))}
    on conflict (student_id, course_id) do nothing returning id`;
  await audit(s.user.id, "STUDENTS_ENROLLED", "course", c.id, { count: added.length }, requireIp(req));
  return { added: added.length };
});
