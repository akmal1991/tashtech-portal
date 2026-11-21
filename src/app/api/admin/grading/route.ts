import { SchemeBody, checkScheme } from "@/lib/admin-schemas";
import { z } from "zod";
import { sql } from "@/lib/db";
import { route, requireIp, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { validateScheme } from "@/lib/grading";

export const POST = route("grading.manage", async (req, s) => {
  const b = SchemeBody.parse(await req.json());
  await checkScheme(b);
  const id = await sql.begin(async (tx) => {
    if (b.is_default) await tx`update grading_schemes set is_default = false`;
    const [r] = await tx`insert into grading_schemes (name, description, pass_mark, min_attendance, retake_cap, is_default, scale)
      values (${b.name}, ${b.description ?? null}, ${b.pass_mark}, ${b.min_attendance}, ${b.retake_cap}, ${b.is_default}, ${tx.json(b.scale)}) returning id`;
    await tx`insert into scheme_components ${tx(b.components.map((c) => ({ ...c, scheme_id: r.id })))}`;
    return r.id as number;
  });
  await audit(s.user.id, "GRADING_SCHEME_CREATED", "grading_scheme", id, b, requireIp(req));
  return { id };
});
