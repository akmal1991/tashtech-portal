// Shared between server and client — no server-only imports here.

export const PERMISSIONS = [
  { code: "students.view", category: "Students", description: "View student profiles and records" },
  { code: "students.view_sensitive", category: "Students", description: "View and search passport / JSHSHIR data" },
  { code: "students.create", category: "Students", description: "Register new students" },
  { code: "students.edit", category: "Students", description: "Edit student information" },
  { code: "students.delete", category: "Students", description: "Archive (delete) and restore students" },
  { code: "grades.view", category: "Grades", description: "View marks and academic results" },
  { code: "grades.enter", category: "Grades", description: "Enter marks for accessible courses" },
  { code: "grades.edit_direct", category: "Grades", description: "Modify existing marks without approval" },
  { code: "grades.override_lock", category: "Grades", description: "Change marks in locked (closed) semesters" },
  { code: "grades.approve", category: "Grades", description: "Approve or reject grade change requests" },
  { code: "grades.all_courses", category: "Grades", description: "Access all courses (not only assigned ones)" },
  { code: "attendance.manage", category: "Grades", description: "Record attendance" },
  { code: "courses.manage", category: "Academic", description: "Create courses and manage enrollments" },
  { code: "academic.manage", category: "Academic", description: "Manage faculties, programs, groups, years, semesters, subjects" },
  { code: "grading.manage", category: "Academic", description: "Configure grading schemes and assessment types" },
  { code: "import.run", category: "Data", description: "Import data from Excel" },
  { code: "export.run", category: "Data", description: "Export data to Excel / PDF" },
  { code: "reports.view", category: "Data", description: "View dashboards, analytics and reports" },
  { code: "audit.view", category: "Security", description: "View audit logs and full grade history" },
  { code: "users.manage", category: "Security", description: "Manage user accounts" },
  { code: "roles.manage", category: "Security", description: "Manage roles and permissions" },
  { code: "backups.manage", category: "Security", description: "Create, download and restore backups" },
  { code: "settings.manage", category: "System", description: "Portal settings, branding, workflows, dashboard" },
  { code: "customfields.manage", category: "System", description: "Manage custom student fields" },
  { code: "modules.manage", category: "System", description: "Manage modules and custom sections" },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["code"];

export const ALL_PERMISSIONS: Permission[] = PERMISSIONS.map((p) => p.code);

export const ROLE_PRESETS: Record<string, { description: string; permissions: Permission[] }> = {
  Administrator: { description: "Full access to the entire portal", permissions: ALL_PERMISSIONS },
  "Data Entry Officer": {
    description: "Registers students, enters marks, uploads Excel files, submits grade changes for approval",
    permissions: [
      "students.view", "students.create", "students.edit",
      "grades.view", "grades.enter", "attendance.manage",
      "import.run", "export.run", "reports.view",
    ],
  },
  Viewer: {
    description: "Academic staff: read-only access to profiles, results and reports",
    permissions: ["students.view", "grades.view", "grades.all_courses", "reports.view", "export.run"],
  },
};
