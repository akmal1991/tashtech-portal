import { z } from "zod";
import { sql } from "@/lib/db";
import { route, requireIp, ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { decideRequest } from "@/lib/grades";

const Body = z.object({ decision: z.enum(["approved", "rejected", "cancelled"]), comment: z.string().trim().max(500).nullable().optional() });

export const POST = route<{ id: string }>(null, async (req, s, { id }) => {
  const { decision, comment } = Body.parse(await req.json());
  const rid = Number(id);
  if (decision === "cancelled") {
    const [r] = await sql`update grade_change_requests set status = 'cancelled', reviewed_at = now(), reviewed_by = ${s.user.id}
      where id = ${rid} and requested_by = ${s.user.id} and status = 'pending' returning id`;
    if (!r) throw new ApiError(404, "No pending request of yours with this id");
    await audit(s.user.id, "GRADE_CHANGE_CANCELLED", "grade_change_request", rid, null, requireIp(req));
    return { ok: true };
  }
  if (!s.permissions.has("grades.approve")) throw new ApiError(403, "You cannot approve grade changes");
  await decideRequest(s, rid, decision, comment ?? null, requireIp(req));
  return { ok: true };
});
