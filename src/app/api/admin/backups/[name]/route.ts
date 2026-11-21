import { readFile } from "node:fs/promises";
import { z } from "zod";
import { route, requireIp, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { restoreBackup, safeName } from "@/lib/backup";

type P = { name: string };

export const GET = route<P>("backups.manage", async (req, s, { name }) => {
  let file: Buffer;
  try { file = await readFile(safeName(name)); } catch { throw new ApiError(404, "Backup file not found"); }
  await audit(s.user.id, "BACKUP_DOWNLOADED", "backup", name, null, requireIp(req));
  return new Response(new Uint8Array(file), {
    headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${name}"` },
  });
});

// Restore requires typing the file name as confirmation.
export const POST = route<P>("backups.manage", async (req, s, { name }) => {
  const { confirm } = z.object({ confirm: z.string() }).parse(await req.json());
  if (confirm !== name) throw new ApiError(400, "Type the backup file name to confirm the restore");
  if (!s.permissions.has("roles.manage")) throw new ApiError(403, "Only administrators can restore backups");
  try {
    return await restoreBackup(name, s.user.id, requireIp(req));
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(400, `Restore failed: ${(e as Error).message}`);
  }
});
