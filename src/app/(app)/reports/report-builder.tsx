"use client";
import { useState } from "react";
import { FileText, GraduationCap, ClipboardList, CalendarRange } from "lucide-react";
import { api } from "@/lib/client";

type Opt = { id: number; name: string };

export function ReportBuilder({ years, semesters, faculties, groups, courses }: { years: Opt[]; semesters: Opt[]; faculties: Opt[]; groups: Opt[]; courses: Opt[] }) {
  const [sem, setSem] = useState(String(semesters[0]?.id ?? ""));
  const [ay, setAy] = useState(String(years[0]?.id ?? ""));
  const [fac, setFac] = useState("");
  const [grp, setGrp] = useState("");
  const [course, setCourse] = useState(String(courses[0]?.id ?? ""));
  const [q, setQ] = useState("");
  const [students, setStudents] = useState<{ id: number; student_number: string; last_name: string; first_name: string; group_name: string }[]>([]);
  const extra = `${fac ? `&faculty=${fac}` : ""}${grp ? `&group=${grp}` : ""}`;
  const sel = (v: string, set: (x: string) => void, opts: Opt[], all?: string) => (
    <select className="input" value={v} onChange={(e) => set(e.target.value)}>{all && <option value="">{all}</option>}{opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
  );
  const Tile = ({ icon, title, desc, children }: { icon: React.ReactNode; title: string; desc: string; children: React.ReactNode }) => (
    <div className="card card-pad flex flex-col gap-3">
      <div className="flex items-start gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">{icon}</div><div><h3 className="font-semibold">{title}</h3><p className="text-xs text-muted">{desc}</p></div></div>
      {children}
    </div>
  );
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Tile icon={<GraduationCap size={18} />} title="Student transcript / performance report" desc="Official transcript with semester GPAs, or an individual performance analysis.">
        <input className="input" placeholder="Search student by name or ID…" value={q} onChange={async (e) => {
          setQ(e.target.value);
          if (e.target.value.length >= 2) setStudents((await api<{ rows: typeof students }>(`/api/students?q=${encodeURIComponent(e.target.value)}`)).rows);
        }} />
        <ul className="max-h-40 overflow-y-auto text-sm">{students.map((s) => (
          <li key={s.id} className="flex items-center gap-2 border-b border-line py-1.5 last:border-0">
            <span className="flex-1 truncate">{s.last_name} {s.first_name} <span className="font-mono text-xs text-muted">{s.student_number}</span></span>
            <a className="link text-xs" target="_blank" href={`/api/pdf/transcript/${s.id}`}>Transcript</a>
            <a className="link text-xs" target="_blank" href={`/api/pdf/performance/${s.id}`}>Performance</a>
          </li>))}</ul>
      </Tile>
      <Tile icon={<ClipboardList size={18} />} title="Subject grade list" desc="All students of a course with each assessment, totals and distribution.">
        {sel(course, setCourse, courses)}
        <a className="btn btn-primary self-start" target="_blank" href={`/api/pdf/course/${course}`}><FileText size={16} />Generate PDF</a>
      </Tile>
      <Tile icon={<CalendarRange size={18} />} title="Semester report" desc="Group results, subject performance and top students for one semester.">
        {sel(sem, setSem, semesters)}
        <div className="grid grid-cols-2 gap-2">{faculties.length > 0 && sel(fac, setFac, faculties, "All faculties")}{sel(grp, setGrp, groups, "All groups")}</div>
        <a className="btn btn-primary self-start" target="_blank" href={`/api/pdf/semester?sem=${sem}${extra}`}><FileText size={16} />Generate PDF</a>
      </Tile>
      <Tile icon={<CalendarRange size={18} />} title="Academic year report" desc="Aggregated results across both semesters of an academic year.">
        {sel(ay, setAy, years)}
        <a className="btn btn-primary self-start" target="_blank" href={`/api/pdf/semester?ay=${ay}${extra}`}><FileText size={16} />Generate PDF</a>
      </Tile>
    </div>
  );
}
