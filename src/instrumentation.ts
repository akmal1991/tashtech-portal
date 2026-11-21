// Starts the automated backup scheduler when the server boots (Node.js runtime only).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startBackupScheduler } = await import("./backup-scheduler");
    await startBackupScheduler();
  }
}
