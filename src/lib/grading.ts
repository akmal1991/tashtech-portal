// Pure grade-calculation engine (no DB access) — shared by API, import, seed and tests.

export type ScaleEntry = { letter: string; min: number; points: number; label?: string };

export type SchemeComponent = {
  assessmentTypeId: number;
  code: string;
  name: string;
  weight: number;
  maxScore: number;
  minScore: number;
  replacesTypeId: number | null;
};

export type Scheme = {
  id: number;
  name: string;
  passMark: number;
  minAttendance: number;
  retakeCap: number | null;
  scale: ScaleEntry[];
  components: SchemeComponent[];
};

export type Scores = Record<number, number | null | undefined>;

export type ComputedResult = {
  total: number | null;
  letter: string | null;
  points: number | null;
  status: "incomplete" | "passed" | "failed";
  needsRetake: boolean;
  retakeUsed: boolean;
  missing: string[];
  belowMinimum: string[];
  attendanceFail: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function letterFor(scale: ScaleEntry[], total: number): ScaleEntry {
  const sorted = [...scale].sort((a, b) => b.min - a.min);
  return sorted.find((s) => total >= s.min) ?? sorted[sorted.length - 1];
}

export function computeResult(scheme: Scheme, scores: Scores, attendancePct: number | null = null): ComputedResult {
  const byType = new Map(scheme.components.map((c) => [c.assessmentTypeId, c]));
  const effective = new Map<number, number>();
  for (const c of scheme.components) {
    const s = scores[c.assessmentTypeId];
    if (c.replacesTypeId == null && s != null) effective.set(c.assessmentTypeId, s);
  }

  // Retake components replace their target (normalised to the target's max score) when present.
  let retakeUsed = false;
  for (const c of scheme.components) {
    if (c.replacesTypeId == null) continue;
    const s = scores[c.assessmentTypeId];
    const target = byType.get(c.replacesTypeId);
    if (s == null || !target) continue;
    effective.set(target.assessmentTypeId, (s / c.maxScore) * target.maxScore);
    retakeUsed = true;
  }

  const weighted = scheme.components.filter((c) => c.replacesTypeId == null && c.weight > 0);
  const missing = weighted.filter((c) => !effective.has(c.assessmentTypeId)).map((c) => c.code);
  let total = 0;
  for (const c of weighted) {
    const s = effective.get(c.assessmentTypeId);
    if (s != null) total += (s / c.maxScore) * c.weight;
  }
  total = round2(total);
  const hasRetakeComponent = scheme.components.some((c) => c.replacesTypeId != null);

  if (missing.length) {
    return {
      total: effective.size ? total : null, letter: null, points: null, status: "incomplete",
      needsRetake: false, retakeUsed, missing, belowMinimum: [], attendanceFail: false,
    };
  }

  if (retakeUsed && scheme.retakeCap != null) total = Math.min(total, scheme.retakeCap);
  const belowMinimum = weighted
    .filter((c) => (effective.get(c.assessmentTypeId) ?? 0) < c.minScore)
    .map((c) => c.code);
  const attendanceFail = scheme.minAttendance > 0 && attendancePct != null && attendancePct < scheme.minAttendance;
  const passed = total >= scheme.passMark && belowMinimum.length === 0 && !attendanceFail;
  const lowest = [...scheme.scale].sort((a, b) => a.min - b.min)[0];
  const entry = passed ? letterFor(scheme.scale, total) : lowest;

  return {
    total, letter: entry?.letter ?? null, points: entry?.points ?? null,
    status: passed ? "passed" : "failed",
    needsRetake: !passed && !retakeUsed && hasRetakeComponent,
    retakeUsed, missing: [], belowMinimum, attendanceFail,
  };
}

/** Credit-weighted GPA over completed (passed/failed) results. */
export function gpa(results: { points: number | null; credits: number; status: string }[]): number | null {
  const done = results.filter((r) => r.status !== "incomplete" && r.points != null);
  const credits = done.reduce((s, r) => s + r.credits, 0);
  if (!credits) return null;
  return round2(done.reduce((s, r) => s + (r.points as number) * r.credits, 0) / credits);
}

export function validateScheme(components: { weight: number; maxScore: number; minScore: number; replacesTypeId: number | null }[]): string[] {
  const errors: string[] = [];
  const sum = components.filter((c) => c.replacesTypeId == null).reduce((s, c) => s + c.weight, 0);
  if (Math.abs(sum - 100) > 0.001) errors.push(`Component weights must total 100 (currently ${sum}).`);
  for (const c of components) {
    if (c.maxScore <= 0) errors.push("Max score must be greater than 0.");
    if (c.minScore < 0 || c.minScore > c.maxScore) errors.push("Minimum score must be between 0 and the max score.");
  }
  return errors;
}
