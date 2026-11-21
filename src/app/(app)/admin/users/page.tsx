import { requirePage } from "@/lib/auth";
import { sql } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { UserManager } from "./user-manager";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  const s = await requirePage("users.manage");
  const users = await sql`select u.id, u.username, u.full_name, u.email, u.role_id, r.name as role_name, u.faculty_id, f.name as faculty_name, u.is_active,
      u.last_login_at, u.locked_until, coalesce(array_agg(a.course_id) filter (where a.course_id is not null), '{}') as course_ids
    from users u join roles r on r.id = u.role_id left join faculties f on f.id = u.faculty_id left join user_course_assignments a on a.user_id = u.id
    group by u.id, r.name, f.name order by u.full_name`;
  const roles = await sql`select id, name from roles order by name`;
  const faculties = await sql`select id, name from faculties order by name`;
  const courses = await sql`select c.id, c.subject_code || ' · ' || coalesce(c.group_name, '—') || ' · ' || c.semester_name as name, c.is_current
    from v_courses c order by c.is_current desc, c.academic_year_name desc, c.semester_number desc, c.group_name, c.subject_code limit 1000`;
  return (
    <>
      <PageHeader title="Users" subtitle="Accounts, roles, faculty data scope and course assignments for data entry officers." />
      <UserManager users={[...users] as never} roles={[...roles] as never} faculties={[...faculties] as never} courses={[...courses] as never} selfId={s.user.id} />
    </>
  );
}
