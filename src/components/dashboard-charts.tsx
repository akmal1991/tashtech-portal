"use client";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table2, BarChart3 } from "lucide-react";

type Pt = { name: string; value: number; full?: string; degree_level?: string };
type Trend = { name: string; pass: number; avg: number };

const LETTER_ORDER = ["A", "B+", "B", "C+", "C", "D", "F"];
// Single-series charts use one hue (validated reference slot 1); theme-specific step via CSS var.
const SERIES = "var(--viz-1)";
const axis = { stroke: "var(--muted)", fontSize: 11, tickLine: false, axisLine: false } as const;

function Tip({ active, payload, label, unit, extra }: { active?: boolean; payload?: { value: number; payload: Record<string, unknown> }[]; label?: string; unit?: string; extra?: (p: Record<string, unknown>) => string | null }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="card px-3 py-2 text-xs shadow-lg">
      <div className="font-semibold text-fg">{String(p.payload.full ?? label)}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-muted"><span className="h-2 w-2 rounded-sm" style={{ background: SERIES }} /><span className="tabular text-fg">{p.value}{unit}</span></div>
      {extra?.(p.payload) && <div className="mt-0.5 text-muted">{extra(p.payload)}</div>}
    </div>
  );
}

function ChartCard({ title, subtitle, rows, children, head }: { title: string; subtitle?: string; rows: (string | number)[][]; head: string[]; children: React.ReactNode }) {
  const [table, setTable] = useState(false);
  return (
    <section className="card">
      <div className="flex items-start justify-between gap-2 border-b border-line px-5 py-3">
        <div><h2 className="text-sm font-semibold">{title}</h2>{subtitle && <p className="text-xs text-muted">{subtitle}</p>}</div>
        <button className="btn btn-ghost btn-sm" onClick={() => setTable((v) => !v)} aria-label={table ? "Show chart" : "Show table"} title={table ? "Show chart" : "Show table"}>
          {table ? <BarChart3 size={15} /> : <Table2 size={15} />}
        </button>
      </div>
      <div className="p-4">
        {rows.length === 0 ? <div className="grid h-56 place-items-center text-sm text-muted">No data for this selection</div>
          : table ? (
            <div className="max-h-56 overflow-y-auto"><table className="table"><thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={j ? "tabular text-right" : ""}>{c}</td>)}</tr>)}</tbody></table></div>
          ) : <div className="h-56">{children}</div>}
      </div>
    </section>
  );
}

function Bars({ data, unit, horizontal, extra }: { data: Pt[]; unit?: string; horizontal?: boolean; extra?: (p: Record<string, unknown>) => string | null }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      {horizontal ? (
        <BarChart data={data} layout="vertical" margin={{ left: 4, right: 24, top: 4, bottom: 4 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke="var(--line)" />
          <XAxis type="number" {...axis} allowDecimals={false} />
          <YAxis type="category" dataKey="name" {...axis} width={130} tick={{ fontSize: 11, fill: "var(--muted)" }} />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<Tip unit={unit} extra={extra} />} />
          <Bar dataKey="value" fill={SERIES} radius={[0, 4, 4, 0]} maxBarSize={22} />
        </BarChart>
      ) : (
        <BarChart data={data} margin={{ left: -12, right: 8, top: 8, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="name" {...axis} tick={{ fontSize: 11, fill: "var(--muted)" }} />
          <YAxis {...axis} allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted)" }} />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<Tip unit={unit} extra={extra} />} />
          <Bar dataKey="value" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={44} />
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

export function DashboardCharts({ widgets, byFaculty, byProgram, byYear, dist, passTrend }: {
  widgets: string[]; byFaculty: Pt[]; byProgram: Pt[]; byYear: Pt[]; dist: Pt[]; passTrend: Trend[];
}) {
  const w = new Set(widgets);
  const distSorted = LETTER_ORDER.map((l) => dist.find((d) => d.name === l)).filter(Boolean) as Pt[];
  const distTotal = distSorted.reduce((a, d) => a + d.value, 0);
  const cards: React.ReactNode[] = [];
  if (w.has("gradeDistribution")) cards.push(
    <ChartCard key="dist" title="Grade distribution" subtitle={`${distTotal.toLocaleString()} final letter grades`} head={["Letter", "Results", "Share"]}
      rows={distSorted.map((d) => [d.name, d.value, `${((d.value / distTotal) * 100).toFixed(1)}%`])}>
      <Bars data={distSorted} extra={(p) => `${(((p.value as number) / distTotal) * 100).toFixed(1)}% of results`} />
    </ChartCard>);
  if (w.has("passFail")) cards.push(
    <ChartCard key="pass" title="Pass rate by semester" subtitle="Share of completed course results that passed" head={["Semester", "Pass rate", "Avg total"]}
      rows={passTrend.map((t) => [t.name, `${t.pass}%`, t.avg])}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={passTrend} margin={{ left: -12, right: 12, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="name" {...axis} tick={{ fontSize: 10, fill: "var(--muted)" }} interval="preserveStartEnd" />
          <YAxis {...axis} domain={[50, 100]} unit="%" tick={{ fontSize: 11, fill: "var(--muted)" }} />
          <Tooltip cursor={{ stroke: "var(--muted)", strokeDasharray: "3 3" }} content={<Tip unit="%" extra={(p) => `Average total ${p.avg}`} />} />
          <Line type="monotone" dataKey="pass" stroke={SERIES} strokeWidth={2} dot={{ r: 4, fill: SERIES, stroke: "var(--surface)", strokeWidth: 2 }} activeDot={{ r: 6, stroke: "var(--surface)", strokeWidth: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>);
  if (w.has("byFaculty")) cards.push(
    <ChartCard key="fac" title="Active students by faculty" head={["Faculty", "Students"]} rows={byFaculty.map((d) => [d.full ?? d.name, d.value])}>
      <Bars data={byFaculty} />
    </ChartCard>);
  if (w.has("byYear")) cards.push(
    <ChartCard key="year" title="Active students by year of study" head={["Year", "Students"]} rows={byYear.map((d) => [d.name, d.value])}>
      <Bars data={byYear} />
    </ChartCard>);
  if (w.has("byProgram")) cards.push(
    <ChartCard key="prog" title="Active students by study program" head={["Program", "Degree", "Students"]} rows={byProgram.map((d) => [d.name, d.degree_level ?? "", d.value])}>
      <Bars data={byProgram} horizontal extra={(p) => String(p.degree_level ?? "")} />
    </ChartCard>);
  if (!cards.length) return null;
  return <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{cards}</div>;
}
