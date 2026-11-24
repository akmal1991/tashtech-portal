// Configuration for the generic admin entity manager (client-safe).
import type { Permission } from "./permissions";

export type FieldDef = {
  name: string;
  label: string;
  type: "text" | "number" | "date" | "boolean" | "select" | "textarea" | "ref" | "color";
  ref?: string;
  options?: string[];
  required?: boolean;
  list?: boolean; // show in table (default true)
  help?: string;
};

export type EntityDef = {
  table: string;
  label: string;
  singular: string;
  permission: Permission;
  display: string; // column used as label in reference pickers
  order: string;
  fields: FieldDef[];
};

export const ICONS = ["FileText", "BookOpen", "Link", "Calendar", "ClipboardList", "Award", "Building2", "Users", "Megaphone", "HelpCircle", "Layers", "Briefcase"];

export const ENTITIES = {
  faculties: {
    table: "faculties", label: "Faculties", singular: "Faculty", permission: "academic.manage", display: "name", order: "name",
    fields: [
      { name: "code", label: "Code", type: "text", required: true },
      { name: "name", label: "Name", type: "text", required: true },
      { name: "dean", label: "Dean", type: "text" },
    ],
  },
  departments: {
    table: "departments", label: "Departments", singular: "Department", permission: "academic.manage", display: "name", order: "name",
    fields: [
      { name: "faculty_id", label: "Faculty", type: "ref", ref: "faculties", required: true },
      { name: "code", label: "Code", type: "text", required: true },
      { name: "name", label: "Name", type: "text", required: true },
      { name: "head", label: "Head of department", type: "text" },
    ],
  },
  programs: {
    table: "programs", label: "Study programs", singular: "Program", permission: "academic.manage", display: "name", order: "name",
    fields: [
      { name: "department_id", label: "Department", type: "ref", ref: "departments", required: true },
      { name: "code", label: "Code", type: "text", required: true },
      { name: "name", label: "Name", type: "text", required: true },
      { name: "degree_level", label: "Degree level", type: "select", options: ["Bachelor", "Master", "PhD"], required: true },
      { name: "duration_years", label: "Duration (years)", type: "number", required: true },
    ],
  },
  groups: {
    table: "student_groups", label: "Groups", singular: "Group", permission: "academic.manage", display: "name", order: "name",
    fields: [
      { name: "program_id", label: "Program (blank = shared group)", type: "ref", ref: "programs" },
      { name: "name", label: "Group name", type: "text", required: true },
      { name: "admission_year", label: "Admission year", type: "number", required: true },
      { name: "curator", label: "Curator", type: "text" },
    ],
  },
  academic_years: {
    table: "academic_years", label: "Academic years", singular: "Academic year", permission: "academic.manage", display: "name", order: "start_date desc",
    fields: [
      { name: "name", label: "Name (e.g. 2027-2028)", type: "text", required: true },
      { name: "start_date", label: "Start date", type: "date", required: true },
      { name: "end_date", label: "End date", type: "date", required: true },
      { name: "is_current", label: "Current year", type: "boolean" },
    ],
  },
  semesters: {
    table: "semesters", label: "Semesters", singular: "Semester", permission: "academic.manage", display: "name", order: "start_date desc nulls last",
    fields: [
      { name: "academic_year_id", label: "Academic year", type: "ref", ref: "academic_years", required: true },
      { name: "number", label: "Number", type: "number", required: true },
      { name: "name", label: "Name", type: "text", required: true },
      { name: "start_date", label: "Start date", type: "date" },
      { name: "end_date", label: "End date", type: "date" },
      { name: "is_current", label: "Current semester", type: "boolean" },
      { name: "is_locked", label: "Locked (grades closed)", type: "boolean", help: "When locked, operators can no longer change marks — only request changes for admin approval." },
    ],
  },
  subjects: {
    table: "subjects", label: "Subjects", singular: "Subject", permission: "academic.manage", display: "name", order: "code",
    fields: [
      { name: "code", label: "Code", type: "text", required: true },
      { name: "name", label: "Name", type: "text", required: true },
      { name: "department_id", label: "Department", type: "ref", ref: "departments" },
      { name: "credits", label: "Credits", type: "number", required: true },
      { name: "ects", label: "ECTS", type: "number", required: true },
      { name: "description", label: "Description", type: "textarea", list: false },
    ],
  },
  assessment_types: {
    table: "assessment_types", label: "Assessment types", singular: "Assessment type", permission: "grading.manage", display: "name", order: "sort_order, id",
    fields: [
      { name: "code", label: "Code", type: "text", required: true },
      { name: "name", label: "Name", type: "text", required: true },
      { name: "replaces_type_id", label: "Replaces (retake of)", type: "ref", ref: "assessment_types", help: "If set, this mark replaces the selected assessment when entered (e.g. a retake replaces the final exam)." },
      { name: "sort_order", label: "Order", type: "number" },
      { name: "is_active", label: "Active", type: "boolean" },
      { name: "description", label: "Description", type: "textarea", list: false },
    ],
  },
  custom_fields: {
    table: "custom_fields", label: "Custom student fields", singular: "Custom field", permission: "customfields.manage", display: "label", order: "sort_order, id",
    fields: [
      { name: "field_key", label: "Key (no spaces)", type: "text", required: true },
      { name: "label", label: "Label", type: "text", required: true },
      { name: "field_type", label: "Type", type: "select", options: ["text", "number", "date", "select", "checkbox"], required: true },
      { name: "options", label: "Options (comma separated, for select)", type: "text" },
      { name: "is_required", label: "Required", type: "boolean" },
      { name: "is_active", label: "Active", type: "boolean" },
      { name: "sort_order", label: "Order", type: "number" },
    ],
  },
  custom_modules: {
    table: "custom_modules", label: "Custom modules & sections", singular: "Module", permission: "modules.manage", display: "title", order: "sort_order, id",
    fields: [
      { name: "slug", label: "URL slug", type: "text", required: true, help: "Page will be available at /m/<slug>" },
      { name: "title", label: "Menu title", type: "text", required: true },
      { name: "icon", label: "Icon", type: "select", options: ICONS },
      { name: "link_url", label: "External link (optional)", type: "text", help: "If set, the menu item opens this link instead of a page." },
      { name: "required_permission", label: "Visible to permission (blank = everyone)", type: "text" },
      { name: "is_active", label: "Active", type: "boolean" },
      { name: "sort_order", label: "Order", type: "number" },
      { name: "content", label: "Page content (Markdown)", type: "textarea", list: false },
    ],
  },
} satisfies Record<string, EntityDef>;

export type EntityKey = keyof typeof ENTITIES;
export const isEntityKey = (k: string): k is EntityKey => k in ENTITIES;
