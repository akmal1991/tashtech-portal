import "server-only";
import { z } from "zod";
import { sql } from "./db";
import { ApiError } from "./api";
import { validateScheme } from "./grading";
import { ALL_PERMISSIONS } from "./permissions";

export const UserBody = z.object({
  username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/, "letters, digits, . _ - only"),
  full_name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().nullable().optional().or(z.literal("").transform(() => null)),
  role_id: z.number().int().positive(),
  faculty_id: z.number().int().positive().nullable().optional(),
  is_active: z.boolean().default(true),
  password: z.string().max(200).optional(),
  course_ids: z.array(z.number().int()).optional(),
});

export const RoleBody = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).nullable().optional(),
  permissions: z.array(z.string()).transform((p) => p.filter((x) => (ALL_PERMISSIONS as string[]).includes(x))),
});

export const SchemeBody = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(300).nullable().optional(),
  pass_mark: z.number().min(0).max(100),
  min_attendance: z.number().min(0).max(100),
  retake_cap: z.number().min(0).max(100).nullable(),
  is_default: z.boolean(),
  scale: z.array(z.object({ letter: z.string().trim().min(1).max(4), min: z.number().min(0).max(100), points: z.number().min(0).max(5), label: z.string().max(40).optional() })).min(2),
  components: z.array(z.object({ assessment_type_id: z.number().int(), weight: z.number().min(0).max(100), max_score: z.number().positive(), min_score: z.number().min(0) })).min(1),
});

export async function checkScheme(b: z.infer<typeof SchemeBody>) {
  const types = await sql`select id, replaces_type_id from assessment_types where id = any(${b.components.map((c) => c.assessment_type_id)})`;
  const rep = new Map(types.map((t) => [t.id as number, t.replaces_type_id as number | null]));
  const errors = validateScheme(b.components.map((c) => ({ weight: c.weight, maxScore: c.max_score, minScore: c.min_score, replacesTypeId: rep.get(c.assessment_type_id) ?? null })));
  if (!b.scale.some((s) => s.min === 0)) errors.push("The grading scale needs an entry starting at 0.");
  if (new Set(b.components.map((c) => c.assessment_type_id)).size !== b.components.length) errors.push("Each assessment type may appear only once.");
  if (errors.length) throw new ApiError(400, errors.join(" "));
}
