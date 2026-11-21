import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {} });
try {
  if (process.argv.includes("--reset")) {
    console.log("Dropping schema public …");
    await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  }
  const schema = await Bun.file(new URL("../db/schema.sql", import.meta.url)).text();
  await sql.unsafe(schema);
  console.log("Schema applied.");
} finally {
  await sql.end();
}
