import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
try {
  if (process.argv.includes("--reset")) {
    if (!process.argv.includes("--yes-delete-all-data")) {
      console.error("--reset deletes EVERY table (students, grades, history). Add --yes-delete-all-data to confirm.");
      process.exit(1);
    }
    const [{ n }] = await sql`select count(*)::int as n from information_schema.tables where table_name = 'students'`;
    if (n) {
      const [{ real }] = await sql`select count(*)::int as real from students where student_number like 'TTB%'`;
      if (real > 0 && !process.argv.includes("--even-real-students")) {
        console.error(`Refusing: the database holds ${real} real student records (TTB…). Back up first; add --even-real-students only if you truly mean it.`);
        process.exit(1);
      }
    }
    console.log("Dropping schema public …");
    await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  }
  const schema = await Bun.file(new URL("../db/schema.sql", import.meta.url)).text();
  await sql.unsafe(schema);
  console.log("Schema applied.");
} finally {
  await sql.end();
}
