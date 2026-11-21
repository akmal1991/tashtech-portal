import { z } from "zod";
import { sql } from "@/lib/db";
import { route, requireIp, ApiError } from "@/lib/api";
import { audit, notifyPermission, notifyUser } from "@/lib/audit";
import { commitGrades, commitStudents, openPayload } from "@/lib/importer";

export const POST = route("import.run", async (req, s) => {
  const { id, cancel } = z.object({ id: z.number().int(), cancel: z.boolean().optional() }).parse(await req.json());
  // Claim the preview atomically so it cannot be committed twice.
  const [h] = await sql`update import_export_history set status = ${cancel ? "cancelled" : "completed"}, completed_at = now()
    where id = ${id} and user_id = ${s.user.id} and status = 'preview' and created_at > now() - interval '2 hours' returning *`;
  if (!h) throw new ApiError(404, "Import preview not found or expired — upload the file again");
  if (cancel) { await sql`update import_export_history set payload = null where id = ${id}`; return { cancelled: true }; }

  const ip = requireIp(req);
  const results = h.entity === "students"
    ? await commitStudents(s, openPayload(h.payload))
    : await commitGrades(s, openPayload(h.payload), h.file_name, ip);
  const failed = results.filter((r) => !r.ok);
  const previewErrors = (h.errors as unknown[]) ?? [];
  const errors = [...previewErrors, ...failed.map((f) => ({ row: f.row, errors: [f.error] }))];
  await sql`update import_export_history set rows_ok = ${results.length - failed.length}, rows_failed = ${h.rows_total - (results.length - failed.length)},
    errors = ${sql.json(errors as never)}, payload = null, status = ${failed.length === results.length && results.length > 0 ? "failed" : "completed"} where id = ${id}`;
  const summary = {
    total: h.rows_total, imported: results.length - failed.length, failed: failed.length, skippedInvalid: previewErrors.length,
    created: results.filter((r) => r.action === "created").length, updated: results.filter((r) => r.action === "updated").length,
    pendingApproval: results.filter((r) => r.action?.includes("pending")).length,
  };
  await audit(s.user.id, "IMPORT_COMPLETED", "import", id, { entity: h.entity, file: h.file_name, ...summary }, ip);
  if (h.entity === "grades" && summary.imported)
    await notifyPermission("grades.approve", { type: "submission", title: "Grades imported from Excel", body: `${s.user.fullName} imported ${summary.imported} row(s) from ${h.file_name}.`, link: "/audit" }, s.user.id);
  if (errors.length) {
    await notifyUser(s.user.id, { type: "import", title: `Import finished with ${errors.length} error(s)`, body: h.file_name, link: `/import?report=${id}` });
    await notifyPermission("audit.view", { type: "import", title: "Import errors", body: `${s.user.fullName}: ${errors.length} error(s) in ${h.file_name}`, link: `/import?report=${id}` }, s.user.id);
  }
  return { summary, results };
});
