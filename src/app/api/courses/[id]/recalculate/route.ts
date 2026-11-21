import { route, requireIp } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getAccessibleCourse, recomputeCourse } from "@/lib/academic";

export const POST = route<{ id: string }>("grading.manage", async (req, s, { id }) => {
  const c = await getAccessibleCourse(s, Number(id));
  const n = await recomputeCourse(c.id);
  await audit(s.user.id, "COURSE_RECALCULATED", "course", c.id, { enrollments: n }, requireIp(req));
  return { recalculated: n };
});
