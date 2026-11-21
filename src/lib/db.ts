import postgres from "postgres";

type G = typeof globalThis & { __tt_sql?: postgres.Sql };
const g = globalThis as G;

function create() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  return postgres(process.env.DATABASE_URL, {
    max: 10,
    idle_timeout: 30,
    transform: { undefined: null },
    types: {
      // numeric -> JS number, date -> 'YYYY-MM-DD' string (avoids timezone shifts)
      numeric: { to: 1700, from: [1700], serialize: (x: unknown) => String(x), parse: (x: string) => parseFloat(x) },
      date: { to: 1082, from: [1082], serialize: (x: unknown) => String(x), parse: (x: string) => x },
    },
  });
}

export const sql: postgres.Sql = g.__tt_sql ?? (g.__tt_sql = create());
export type Tx = postgres.TransactionSql | postgres.Sql;
