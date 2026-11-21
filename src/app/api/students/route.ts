import { sql } from "@/lib/db";
import { route, requireIp, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { StudentInput, buildStudentRow } from "@/lib/students";
import { studentScope } from "@/lib/academic";

// Lightweight lookup for pickers: ?q=
export const GET = route("students.view", async (req, s) => {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const like = `%${q}%`;
  const rows = await sql`select s.id, s.student_number, s.first_name, s.last_name, s.group_name, s.program_name
    from v_students s where s.deleted_at is null ${studentScope(s)}
    and (${q} = '' or s.student_number ilike ${like} or (s.last_name || ' ' || s.first_name) ilike ${like})
    order by s.last_name, s.first_name limit 20`;
  return { rows };
});

export const POST = route("students.create", async (req, s) => {
  const input = StudentInput.parse(await req.json());
  const row = await buildStudentRow(input, s.permissions.has("students.view_sensitive"));
  if (s.user.facultyId) {
    const [p] = await sql`select d.faculty_id from programs p join departments d on d.id = p.department_id where p.id = ${input.program_id}`;
    if (p?.faculty_id !== s.user.facultyId) throw new ApiError(403, "You can only register students in your faculty");
  }
  const [created] = await sql`insert into students ${sql(row as never)} returning id`;
  await audit(s.user.id, "STUDENT_CREATED", "student", created.id, { student_number: input.student_number, name: `${input.last_name} ${input.first_name}` }, requireIp(req));
  return { id: created.id };
});
