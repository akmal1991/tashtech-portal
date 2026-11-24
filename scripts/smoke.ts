import postgres from "postgres";
const db = postgres(process.env.DATABASE_URL!);
const [st] = await db`select id from students where deleted_at is null order by id limit 1`;
const [c] = await db`select c.id from courses c left join user_course_assignments a on a.course_id = c.id order by a.course_id nulls last, c.id limit 1`;
await db.end();
const pages = ["/", "/students", "/students?q=kar&status=Active&sort=group&dir=desc", "/students?result=retake", `/students/${st.id}`, `/students/${st.id}/edit`, "/students/new",
  "/courses", "/courses?missing=1", "/courses?sem=all", `/courses/${c.id}`, `/courses/${c.id}/attendance`, "/approvals", "/approvals?tab=mine", "/approvals?tab=history",
  "/audit", "/audit?tab=activity", "/audit?action=Updated", "/import", "/export", "/reports", "/notifications", "/profile",
  "/admin/users", "/admin/roles", "/admin/academic", "/admin/academic?tab=semesters", "/admin/grading", "/admin/grading?tab=types", "/admin/fields", "/admin/modules", "/admin/settings", "/m/regulations",
  "/?sem=1", "/?ay=2"];
for (const [u, p] of [["admin", "Admin@2026!"], ["operator", "Operator@2026!"], ["viewer", "Viewer@2026!"]]) {
  const r = await fetch("http://localhost:3000/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" }, body: JSON.stringify({ username: u, password: p }) });
  const cookie = (r.headers.get("set-cookie") ?? "").split(";")[0];
  const out: string[] = [];
  for (const path of pages) {
    const res = await fetch("http://localhost:3000" + path, { headers: { Cookie: cookie }, redirect: "manual" });
    const loc = res.headers.get("location");
    if (res.status !== 200) out.push(`${res.status} ${path}${loc ? " -> " + loc : ""}`);
  }
  console.log(`== ${u}: ${pages.length - out.length}/${pages.length} OK`); out.forEach((o) => console.log("   " + o));
}
