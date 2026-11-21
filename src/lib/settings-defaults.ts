// Shared defaults for system_settings (client-safe).

export const DASHBOARD_WIDGETS = [
  { key: "kpis", label: "Key figures" },
  { key: "byFaculty", label: "Students by faculty" },
  { key: "byProgram", label: "Students by study program" },
  { key: "byYear", label: "Students by academic year" },
  { key: "gradeDistribution", label: "Grade distribution" },
  { key: "passFail", label: "Pass / fail rate" },
  { key: "subjectPerformance", label: "Subject performance" },
  { key: "missing", label: "Students with missing grades" },
  { key: "retakes", label: "Students requiring retakes" },
] as const;

export const BUILTIN_MODULES = [
  { key: "attendance", label: "Attendance" },
  { key: "approvals", label: "Grade approvals" },
  { key: "import", label: "Excel import" },
  { key: "export", label: "Data export" },
  { key: "reports", label: "Reports & PDF" },
  { key: "notifications", label: "Notifications" },
] as const;

export const SETTINGS_DEFAULTS = {
  branding: {
    name: "Tashkent University of Technology",
    shortName: "Tashkent Tech",
    tagline: "Academic Records Portal",
    primaryColor: "#0b4f8a",
    accentColor: "#c8962e",
    logoDataUrl: null as string | null,
  },
  workflow: {
    requireApprovalForChanges: true, // modifying an existing mark needs approval unless user has grades.edit_direct
    requireReason: true,             // a reason is mandatory for any modification / deletion
    allowRequestsWhenLocked: true,   // operators may request changes in locked semesters (admin approves)
    notifyOnDirectChanges: true,     // notify approvers when a privileged user modifies a mark directly
  },
  modules: Object.fromEntries(BUILTIN_MODULES.map((m) => [m.key, true])) as Record<string, boolean>,
  dashboard: { widgets: DASHBOARD_WIDGETS.map((w) => w.key) as string[] },
  security: { sessionHours: 8, maxFailedAttempts: 5, lockoutMinutes: 15, minPasswordLength: 10 },
  backup: { autoEnabled: true, intervalHours: 24, keep: 14 },
};

export type Settings = typeof SETTINGS_DEFAULTS;
export type SettingKey = keyof Settings;
