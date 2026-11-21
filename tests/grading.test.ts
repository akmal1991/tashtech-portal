import { describe, expect, test } from "bun:test";
import { computeResult, gpa, validateScheme, type Scheme } from "../src/lib/grading";

const scale = [
  { letter: "A", min: 90, points: 4 }, { letter: "B+", min: 85, points: 3.5 }, { letter: "B", min: 80, points: 3 },
  { letter: "C+", min: 75, points: 2.5 }, { letter: "C", min: 70, points: 2 }, { letter: "D", min: 60, points: 1 }, { letter: "F", min: 0, points: 0 },
];
const comp = (id: number, code: string, weight: number, max: number, min = 0, replaces: number | null = null) =>
  ({ assessmentTypeId: id, code, name: code, weight, maxScore: max, minScore: min, replacesTypeId: replaces });
const scheme: Scheme = {
  id: 1, name: "std", passMark: 60, minAttendance: 0, retakeCap: null, scale,
  components: [comp(1, "P1", 10, 10), comp(2, "P2", 10, 10), comp(3, "CW", 10, 10), comp(4, "MID", 30, 30), comp(5, "FINAL", 40, 40, 12), comp(6, "RETAKE", 0, 40, 0, 5)],
};

describe("grade calculation", () => {
  test("weighted total and letter", () => {
    const r = computeResult(scheme, { 1: 9, 2: 8, 3: 10, 4: 27, 5: 36 });
    expect(r.total).toBe(90);
    expect(r.letter).toBe("A");
    expect(r.status).toBe("passed");
  });
  test("missing component => incomplete with partial total", () => {
    const r = computeResult(scheme, { 1: 9, 2: 8, 3: 10, 4: 27 });
    expect(r.status).toBe("incomplete");
    expect(r.missing).toEqual(["FINAL"]);
    expect(r.total).toBe(54);
    expect(r.letter).toBeNull();
  });
  test("below component minimum fails even with enough total", () => {
    const r = computeResult(scheme, { 1: 10, 2: 10, 3: 10, 4: 30, 5: 10 }); // total 70, FINAL < 12
    expect(r.total).toBe(70);
    expect(r.status).toBe("failed");
    expect(r.letter).toBe("F");
    expect(r.needsRetake).toBe(true);
  });
  test("retake replaces final exam", () => {
    const r = computeResult(scheme, { 1: 5, 2: 5, 3: 5, 4: 15, 5: 10, 6: 30 });
    expect(r.retakeUsed).toBe(true);
    expect(r.total).toBe(60);
    expect(r.status).toBe("passed");
    expect(r.needsRetake).toBe(false);
  });
  test("retake cap limits the total", () => {
    const r = computeResult({ ...scheme, retakeCap: 60 }, { 1: 10, 2: 10, 3: 10, 4: 30, 5: 0, 6: 40 });
    expect(r.total).toBe(60);
  });
  test("attendance requirement", () => {
    const r = computeResult({ ...scheme, minAttendance: 75 }, { 1: 9, 2: 8, 3: 10, 4: 27, 5: 36 }, 60);
    expect(r.status).toBe("failed");
    expect(r.attendanceFail).toBe(true);
  });
  test("credit-weighted GPA ignores incomplete", () => {
    expect(gpa([{ points: 4, credits: 4, status: "passed" }, { points: 2, credits: 2, status: "passed" }, { points: null, credits: 6, status: "incomplete" }])).toBe(3.33);
  });
  test("scheme validation requires weights to total 100", () => {
    expect(validateScheme([{ weight: 50, maxScore: 50, minScore: 0, replacesTypeId: null }])).toHaveLength(1);
    expect(validateScheme([{ weight: 100, maxScore: 100, minScore: 0, replacesTypeId: null }, { weight: 0, maxScore: 40, minScore: 0, replacesTypeId: 1 }])).toHaveLength(0);
  });
});
