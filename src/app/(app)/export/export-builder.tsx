"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { STUDENT_COLUMNS, GRADE_COLUMNS } from "@/lib/export-columns";

type Opt = { id: number; name: string };

export function ExportBuilder({ faculties, programs, groups, years, semesters, subjects, custom, canSensitive, canGrades }: {
  faculties: Opt[]; programs: Opt[]; groups: Opt[]; years: Opt[]; semesters: Opt[]; subjects: Opt[]; custom: { field_key: string; label: string }[]; canSensitive: boolean; canGrades: boolean;
}) {
  const [kind, setKind] = useState<"students" | "grades">("students");
  const sCols = STUDENT_COLUMNS.filter((c) => !("sensitive" in c) || canSensitive);
  const [studentCols, setStudentCols] = useState<string[]>(sCols.filter((c) => "default" in c && c.default).map((c) => c.key));
  const [gradeCols, setGradeCols] = useState<string[]>(GRADE_COLUMNS.filter((c) => "default" in c && c.default).map((c) => c.key));
  const [f, setF] = useState<Record<string, string>>({});
  const set = (k: string) => (e: React.ChangeEvent<HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const cols = kind === "students" ? studentCols : gradeCols;
  const setCols = kind === "students" ? setStudentCols : setGradeCols;
  const all = kind === "students" ? [...sCols.map((c) => ({ key: c.key as string, header: c.header as string, sensitive: "sensitive" in c })), ...custom.map((c) => ({ key: "custom:" + c.field_key, header: c.label, sensitive: false }))]
    : GRADE_COLUMNS.map((c) => ({ key: c.key as string, header: c.header as string, sensitive: false }));
  const params = new URLSearchParams();
  const keys = kind === "students" ? ["faculty", "program", "group", "status", "degree", "year", "ay", "sem", "subject"] : ["faculty", "group", "ay", "sem", "subject"];
  for (const k of keys) if (f[k]) params.set(k, f[k]);
  params.set("columns", cols.join(","));
  const href = `/api/export/${kind}?${params}`;
  const Sel = ({ k, label, opts }: { k: string; label: string; opts: { value: string | number; label: string }[] }) => (
    <div><label className="label">{label}</label><select className="input" value={f[k] ?? ""} onChange={set(k)}><option value="">All</option>{opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
  );
  const o = (x: Opt[]) => x.map((r) => ({ value: r.id, label: r.name }));

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="card card-pad space-y-5">
        <div className="flex gap-2">
          <button className={kind === "students" ? "btn btn-primary" : "btn"} onClick={() => setKind("students")}>Student information</button>
          {canGrades && <button className={kind === "grades" ? "btn btn-primary" : "btn"} onClick={() => setKind("grades")}>Grades</button>}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">Filters</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {faculties.length > 0 && Sel({ k: "faculty", label: "Faculty", opts: o(faculties) })}
            {kind === "students" && Sel({ k: "program", label: "Study program", opts: o(programs) })}
            {Sel({ k: "group", label: "Group", opts: o(groups) })}
            {Sel({ k: "ay", label: "Academic year", opts: o(years) })}
            {Sel({ k: "sem", label: "Semester", opts: o(semesters) })}
            {Sel({ k: "subject", label: "Subject", opts: o(subjects) })}
            {kind === "students" && <>
              {Sel({ k: "status", label: "Status", opts: ["Active", "Graduated", "Suspended", "Withdrawn"].map((v) => ({ value: v, label: v })) })}
              {Sel({ k: "degree", label: "Degree", opts: ["Bachelor", "Master", "PhD"].map((v) => ({ value: v, label: v })) })}
              {Sel({ k: "year", label: "Year of study", opts: [1, 2, 3, 4, 5, 6].map((v) => ({ value: v, label: `Year ${v}` })) })}
            </>}
          </div>
          {kind === "students" && <p className="mt-2 text-xs text-muted">Academic year / semester / subject filters select students enrolled in matching courses.</p>}
        </div>
      </div>
      <div className="card card-pad">
        <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Columns</h3>
          <div className="flex gap-2 text-xs"><button className="link" onClick={() => setCols(all.map((c) => c.key))}>All</button><button className="link" onClick={() => setCols([])}>None</button></div></div>
        <div className="max-h-[420px] space-y-1 overflow-y-auto">
          {all.map((c) => (
            <label key={c.key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={cols.includes(c.key)} onChange={(e) => setCols((x) => e.target.checked ? [...x, c.key] : x.filter((y) => y !== c.key))} />
              {c.header}{c.sensitive && <span className="badge badge-amber">sensitive · logged</span>}
            </label>
          ))}
        </div>
        <a className={`btn btn-primary mt-4 w-full ${cols.length ? "" : "pointer-events-none opacity-50"}`} href={href}><Download size={16} />Download Excel</a>
      </div>
    </div>
  );
}
