import "server-only";
import { sql } from "./db";
import type { Session } from "./auth";

export async function studentFormOptions(s: Session) {
  const scope = s.user.facultyId ? sql`where d.faculty_id = ${s.user.facultyId}` : sql``;
  const programs = await sql`select p.id, p.name || ' — ' || p.degree_level as name from programs p join departments d on d.id = p.department_id ${scope} order by p.name`;
  const groups = await sql`select g.id, g.name, g.program_id from student_groups g order by g.name`;
  const customFields = await sql`select field_key, label, field_type, options, is_required from custom_fields where entity = 'student' and is_active order by sort_order, id`;
  return { programs: [...programs], groups: [...groups], customFields: [...customFields] } as never as {
    programs: { id: number; name: string }[]; groups: { id: number; name: string; program_id: number | null }[];
    customFields: { field_key: string; label: string; field_type: string; options: string | null; is_required: boolean }[];
  };
}
