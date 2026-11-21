import { z } from "zod";
import { sql } from "@/lib/db";
import { route } from "@/lib/api";

export const GET = route(null, async (_req, s) => {
  const [{ unread }] = await sql`select count(*)::int as unread from notifications where user_id = ${s.user.id} and not is_read`;
  const items = await sql`select id, type, title, body, link, is_read, created_at from notifications where user_id = ${s.user.id} order by created_at desc limit 8`;
  const [{ pending }] = s.permissions.has("grades.approve")
    ? await sql`select count(*)::int as pending from grade_change_requests where status = 'pending'`
    : [{ pending: 0 }];
  return { unread, pending, items };
});

export const POST = route(null, async (req, s) => {
  const { ids, all } = z.object({ ids: z.array(z.number()).optional(), all: z.boolean().optional() }).parse(await req.json());
  if (all) await sql`update notifications set is_read = true where user_id = ${s.user.id} and not is_read`;
  else if (ids?.length) await sql`update notifications set is_read = true where user_id = ${s.user.id} and id = any(${ids})`;
  return { ok: true };
});
