import { z } from "zod";
import { route, requireIp } from "@/lib/api";
import { changeGrade } from "@/lib/grades";

const Body = z.object({
  enrollmentId: z.number().int().positive(),
  assessmentTypeId: z.number().int().positive(),
  score: z.number().nullable(),
  reason: z.string().max(500).nullable().optional(),
});

export const POST = route("grades.enter", async (req, s) => {
  const body = Body.parse(await req.json());
  return changeGrade(s, body, requireIp(req));
});
