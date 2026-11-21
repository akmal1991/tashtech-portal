import { route, ApiError } from "@/lib/api";
import { readSheet } from "@/lib/excel";
import { previewGrades, previewStudents } from "@/lib/importer";

export const POST = route("import.run", async (req, s) => {
  const form = await req.formData();
  const file = form.get("file");
  const entity = String(form.get("entity") ?? "");
  if (!(file instanceof File)) throw new ApiError(400, "Please choose an .xlsx file");
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new ApiError(400, "Only .xlsx files are supported");
  if (file.size > 10 * 1024 * 1024) throw new ApiError(400, "File is larger than 10 MB");
  let sheet;
  try { sheet = await readSheet(await file.arrayBuffer()); } catch (e) { throw new ApiError(400, `Could not read the workbook: ${(e as Error).message}`); }
  if (!sheet.rows.length) throw new ApiError(400, "The first sheet contains no data rows");
  if (sheet.rows.length > 5000) throw new ApiError(400, "Maximum 5000 rows per import");
  if (entity === "students") {
    if (!s.permissions.has("students.create") && !s.permissions.has("students.edit")) throw new ApiError(403, "No permission to import students");
    return previewStudents(s, sheet, file.name);
  }
  if (entity === "grades") {
    if (!s.permissions.has("grades.enter")) throw new ApiError(403, "No permission to import grades");
    return previewGrades(s, sheet, file.name);
  }
  throw new ApiError(400, "Unknown import type");
});
