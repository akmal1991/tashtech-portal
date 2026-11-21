import { requirePage } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getAllSettings } from "@/lib/settings";
import { Shell, type NavSection } from "@/components/shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requirePage();
  const settings = await getAllSettings();
  const has = (p: string) => s.permissions.has(p);
  const mod = (k: string) => settings.modules[k] !== false;
  const custom = await sql`select slug, title, icon, link_url, required_permission from custom_modules where is_active order by sort_order, id`;

  const sections: NavSection[] = [
    {
      title: "Academic",
      items: [
        { href: "/", label: "Dashboard", icon: "LayoutDashboard", show: true },
        { href: "/students", label: "Students", icon: "Users", show: has("students.view") },
        { href: "/courses", label: "Courses & Grades", icon: "BookOpenCheck", show: has("grades.view") },
        { href: "/approvals", label: "Grade Approvals", icon: "CheckSquare", show: mod("approvals") && (has("grades.approve") || has("grades.enter")), badge: "pending" },
        { href: "/audit", label: "Audit & History", icon: "History", show: has("audit.view") },
      ],
    },
    {
      title: "Data",
      items: [
        { href: "/import", label: "Excel Import", icon: "Upload", show: mod("import") && has("import.run") },
        { href: "/export", label: "Export", icon: "Download", show: mod("export") && has("export.run") },
        { href: "/reports", label: "Reports & PDF", icon: "FileBarChart", show: mod("reports") && has("reports.view") },
        { href: "/notifications", label: "Notifications", icon: "Bell", show: mod("notifications") },
      ],
    },
    {
      title: "Administration",
      items: [
        { href: "/admin/users", label: "Users", icon: "UserCog", show: has("users.manage") },
        { href: "/admin/roles", label: "Roles & Permissions", icon: "Shield", show: has("roles.manage") },
        { href: "/admin/academic", label: "Academic Structure", icon: "Building2", show: has("academic.manage") },
        { href: "/admin/grading", label: "Grading Policy", icon: "Calculator", show: has("grading.manage") },
        { href: "/admin/fields", label: "Custom Fields", icon: "ListPlus", show: has("customfields.manage") },
        { href: "/admin/modules", label: "Modules", icon: "Blocks", show: has("modules.manage") },
        { href: "/admin/settings", label: "Portal Settings", icon: "Settings", show: has("settings.manage") || has("backups.manage") },
      ],
    },
  ];
  const customItems = custom
    .filter((c) => !c.required_permission || has(c.required_permission))
    .map((c) => ({ href: c.link_url || `/m/${c.slug}`, label: c.title as string, icon: c.icon as string, show: true, external: !!c.link_url }));
  if (customItems.length) sections.splice(2, 0, { title: "Sections", items: customItems });

  return (
    <Shell
      sections={sections.map((sec) => ({ ...sec, items: sec.items.filter((i) => i.show) })).filter((sec) => sec.items.length)}
      user={{ name: s.user.fullName, role: s.user.roleName, faculty: s.user.facultyName }}
      branding={settings.branding}
      notificationsEnabled={mod("notifications")}
    >
      {children}
    </Shell>
  );
}
