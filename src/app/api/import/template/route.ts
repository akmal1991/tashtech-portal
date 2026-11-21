import { sql } from "@/lib/db";
import { route, ApiError } from "@/lib/api";
import { buildWorkbook, xlsxResponse } from "@/lib/excel";
import { GRADE_IMPORT_FIXED, STUDENT_IMPORT_HEADERS } from "@/lib/importer";

export const GET = route("import.run", async (req) => {
  const type = req.nextUrl.searchParams.get("type");
  if (type === "students") {
    const custom = await sql`select label from custom_fields where entity = 'student' and is_active order by sort_order`;
    const headers = [...STUDENT_IMPORT_HEADERS.map(([h]) => h), ...custom.map((c) => c.label as string)];
    const example: Record<string, unknown> = {
      "Student ID": "TT2600999", "Last Name": "Aliyev", "First Name": "Sardor", "Middle Name": "Botirovich", Passport: "AB1234567",
      JSHSHIR: "50101080011223", "Date of Birth": "2008-01-01", Gender: "Male", "Program Code": "SE-B", Group: "SE-26-01", Year: 1, Semester: 1,
      "Study Mode": "Full-time", Status: "Active", "Enrollment Date": "2026-09-01", Phone: "+998 90 123 45 67", Email: "s.aliyev@student.tashtech.uz",
    };
    const programs = await sql`select code, name, degree_level from programs order by code`;
    const groups = await sql`select g.name, p.code from student_groups g join programs p on p.id = g.program_id order by g.name`;
    const buf = await buildWorkbook([
      { name: "Students", columns: headers.map((h) => ({ header: h, key: h, width: 18 })), rows: [example] },
      { name: "Reference - Programs", columns: [{ header: "Program Code", key: "code" }, { header: "Name", key: "name", width: 30 }, { header: "Degree", key: "degree_level" }], rows: programs },
      { name: "Reference - Groups", columns: [{ header: "Group", key: "name" }, { header: "Program Code", key: "code" }], rows: groups },
    ]);
    return xlsxResponse(buf, "student-import-template.xlsx");
  }
  if (type === "grades") {
    const types = await sql`select code from assessment_types where is_active order by sort_order`;
    const headers = [...GRADE_IMPORT_FIXED.slice(0, 4), ...types.map((t) => t.code as string), "Reason"];
    const buf = await buildWorkbook([{
      name: "Grades", columns: headers.map((h) => ({ header: h, key: h, width: 16 })),
      rows: [{ "Student ID": "TT2600123", "Subject Code": "CS101", "Academic Year": "2026-2027", Semester: 1, P1: 8, P2: 9, CW: 7, MID: 24, Reason: "" }],
    }, {
      name: "Instructions", columns: [{ header: "Notes", key: "n", width: 110 }],
      rows: [
        { n: "One row per student and course. Student ID + Subject Code + Academic Year + Semester identify the enrollment." },
        { n: "Assessment columns use codes (P1, P2, CW, MID, FINAL, RETAKE). Leave a cell empty to keep the current mark; enter - to delete a mark." },
        { n: "Changing an existing mark may require administrator approval and a reason (Reason column)." },
        { n: "Marks for locked semesters are submitted as change requests." },
      ],
    }]);
    return xlsxResponse(buf, "grade-import-template.xlsx");
  }
  throw new ApiError(400, "Unknown template type");
});
