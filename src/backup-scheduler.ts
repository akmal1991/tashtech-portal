// Automated backup scheduler (Node.js runtime only).
export async function startBackupScheduler() {
  const g = globalThis as { __tt_backup_timer?: unknown };
  if (g.__tt_backup_timer) return;
  const { sql } = await import("./lib/db");
  const { getSetting } = await import("./lib/settings");
  const { createBackup } = await import("./lib/backup");

  const tick = async () => {
    try {
      const cfg = await getSetting("backup");
      if (!cfg.autoEnabled) return;
      const [last] = await sql`select max(created_at) as at from backups where kind = 'auto'`;
      const due = !last?.at || Date.now() - new Date(last.at).getTime() > cfg.intervalHours * 3600_000;
      if (due) console.log("[backup] automatic backup created:", await createBackup("auto", null));
    } catch (e) {
      console.error("[backup] automatic backup failed:", (e as Error).message);
    }
  };
  g.__tt_backup_timer = setInterval(tick, 15 * 60_000);
  setTimeout(tick, 20_000);
}
