"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Opt = { id: number; name: string; academic_year_id?: number };

export function DashboardFilters({ years, semesters, faculties }: { years: Opt[]; semesters: Opt[]; faculties: Opt[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const set = (k: string, v: string, clear: string[] = []) => {
    const p = new URLSearchParams(sp.toString());
    if (v) p.set(k, v); else p.delete(k);
    clear.forEach((c) => p.delete(c));
    router.push(`${pathname}${p.toString() ? `?${p}` : ""}`);
  };
  const ay = sp.get("ay") ?? "";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Academic year" className="input h-9 w-auto" value={ay} onChange={(e) => set("ay", e.target.value, ["sem"])}>
        <option value="">All academic years</option>
        {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
      </select>
      <select aria-label="Semester" className="input h-9 w-auto" value={sp.get("sem") ?? ""} onChange={(e) => set("sem", e.target.value)}>
        <option value="">All semesters</option>
        {semesters.filter((s) => !ay || String(s.academic_year_id) === ay).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      {faculties.length > 0 && (
        <select aria-label="Faculty" className="input h-9 w-auto" value={sp.get("faculty") ?? ""} onChange={(e) => set("faculty", e.target.value)}>
          <option value="">All faculties</option>
          {faculties.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      )}
    </div>
  );
}
