import { sql } from "@/lib/db";
import { route } from "@/lib/api";
import { createBackup } from "@/lib/backup";

export const GET = route("backups.manage", async () => {
  const rows = await sql`select b.*, u.full_name from backups b left join users u on u.id = b.created_by order by b.created_at desc limit 100`;
  return { rows };
});

export const POST = route("backups.manage", async (_req, s) => {
  const name = await createBackup("manual", s.user.id);
  return { name };
});
