"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { useToast } from "@/components/client-ui";
import { computeResult } from "@/lib/grading";

type Comp = { assessment_type_id: number; weight: number; max_score: number; min_score: number };
type Scale = { letter: string; min: number; points: number; label?: string };
type Scheme = { id: number; name: string; description: string | null; pass_mark: number; min_attendance: number; retake_cap: number | null; is_default: boolean; scale: Scale[]; components: Comp[]; courses: number };
type Type = { id: number; code: string; name: string; replaces_type_id: number | null; is_active: boolean };

export function SchemeEditor({ schemes, types }: { schemes: Scheme[]; types: Type[] }) {
  const router = useRouter();
  const toast = useToast();
  const blank: Scheme = { id: 0, name: "", description: "", pass_mark: 60, min_attendance: 0, retake_cap: null, is_default: false, courses: 0,
    scale: schemes[0]?.scale ?? [{ letter: "A", min: 90, points: 4 }, { letter: "F", min: 0, points: 0 }], components: [] };
  const [d, setD] = useState<Scheme>(schemes[0] ?? blank);
  const [busy, setBusy] = useState(false);
  const typeOf = (id: number) => types.find((t) => t.id === id);
  const sum = d.components.filter((c) => !typeOf(c.assessment_type_id)?.replaces_type_id).reduce((a, c) => a + Number(c.weight), 0);
  const setComp = (i: number, k: keyof Comp, v: number) => setD((x) => ({ ...x, components: x.components.map((c, j) => (j === i ? { ...c, [k]: v } : c)) }));
  const setScale = (i: number, k: keyof Scale, v: string | number) => setD((x) => ({ ...x, scale: x.scale.map((c, j) => (j === i ? { ...c, [k]: v } : c)) }));

  // Live preview: a student scoring 75% on every component
  const preview = computeResult({
    id: 0, name: "", passMark: d.pass_mark, minAttendance: d.min_attendance, retakeCap: d.retake_cap, scale: d.scale,
    components: d.components.map((c) => ({ assessmentTypeId: c.assessment_type_id, code: typeOf(c.assessment_type_id)?.code ?? "", name: "", weight: Number(c.weight), maxScore: Number(c.max_score), minScore: Number(c.min_score), replacesTypeId: typeOf(c.assessment_type_id)?.replaces_type_id ?? null })),
  }, Object.fromEntries(d.components.filter((c) => !typeOf(c.assessment_type_id)?.replaces_type_id).map((c) => [c.assessment_type_id, Number(c.max_score) * 0.75])), null);

  const save = async () => {
    setBusy(true);
    try {
      const body = { name: d.name, description: d.description, pass_mark: Number(d.pass_mark), min_attendance: Number(d.min_attendance), retake_cap: d.retake_cap === null || (d.retake_cap as unknown) === "" ? null : Number(d.retake_cap),
        is_default: d.is_default, scale: d.scale.map((s) => ({ ...s, min: Number(s.min), points: Number(s.points) })), components: d.components.map((c) => ({ assessment_type_id: c.assessment_type_id, weight: Number(c.weight), max_score: Number(c.max_score), min_score: Number(c.min_score) })) };
      const r = d.id ? await api<{ recalculated: number }>(`/api/admin/grading/${d.id}`, { method: "PUT", body }) : await api("/api/admin/grading", { body });
      toast("ok", d.id ? `Scheme saved — ${(r as { recalculated: number }).recalculated} result(s) recalculated in open semesters` : "Scheme created");
      router.refresh();
    } catch (e) { toast("error", (e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
      <div className="card overflow-hidden">
        <ul>{schemes.map((s) => (
          <li key={s.id}><button onClick={() => setD(s)} className={clsx("w-full border-b border-line px-4 py-3 text-left text-sm hover:bg-surface-2", d.id === s.id && "bg-surface-2 font-semibold")}>
            {s.name}{s.is_default && <span className="badge badge-blue ml-1">default</span>}<div className="text-xs font-normal text-muted">{s.courses} courses</div></button></li>))}</ul>
        <button className="btn btn-ghost w-full rounded-none" onClick={() => setD(blank)}><Plus size={16} />New scheme</button>
      </div>
      <div className="card card-pad space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2"><label className="label">Scheme name</label><input className="input" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></div>
          <div><label className="label">Pass mark (0–100)</label><input type="number" className="input" value={d.pass_mark} onChange={(e) => setD({ ...d, pass_mark: Number(e.target.value) })} /></div>
          <div><label className="label">Min. attendance % (0 = off)</label><input type="number" className="input" value={d.min_attendance} onChange={(e) => setD({ ...d, min_attendance: Number(e.target.value) })} /></div>
          <div className="sm:col-span-2"><label className="label">Description</label><input className="input" value={d.description ?? ""} onChange={(e) => setD({ ...d, description: e.target.value })} /></div>
          <div><label className="label">Max total after retake (blank = no cap)</label><input type="number" className="input" value={d.retake_cap ?? ""} onChange={(e) => setD({ ...d, retake_cap: e.target.value === "" ? null : Number(e.target.value) })} /></div>
          <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={d.is_default} onChange={(e) => setD({ ...d, is_default: e.target.checked })} />Default for new courses</label>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">Assessment components</h3>
            <span className={clsx("text-xs", Math.abs(sum - 100) < 0.01 ? "text-ok" : "text-bad")}>Weights total: {sum}% {Math.abs(sum - 100) < 0.01 ? "✓" : "(must be 100)"}</span></div>
          <div className="scroll-x"><table className="table">
            <thead><tr><th>Assessment</th><th>Weight %</th><th>Max score</th><th>Min. required</th><th /></tr></thead>
            <tbody>{d.components.map((c, i) => {
              const t = typeOf(c.assessment_type_id);
              return (
                <tr key={c.assessment_type_id}>
                  <td><b>{t?.code}</b> {t?.name}{t?.replaces_type_id && <div className="text-xs text-muted">Replaces {typeOf(t.replaces_type_id)?.code} when entered (weight not used)</div>}</td>
                  <td><input type="number" className="input h-8 w-24" disabled={!!t?.replaces_type_id} value={c.weight} onChange={(e) => setComp(i, "weight", Number(e.target.value))} /></td>
                  <td><input type="number" className="input h-8 w-24" value={c.max_score} onChange={(e) => setComp(i, "max_score", Number(e.target.value))} /></td>
                  <td><input type="number" className="input h-8 w-24" value={c.min_score} onChange={(e) => setComp(i, "min_score", Number(e.target.value))} /></td>
                  <td><button className="btn btn-ghost btn-sm text-bad" onClick={() => setD({ ...d, components: d.components.filter((_, j) => j !== i) })} aria-label="Remove"><Trash2 size={14} /></button></td>
                </tr>);
            })}</tbody>
          </table></div>
          <select className="input mt-2 w-auto" value="" onChange={(e) => e.target.value && setD({ ...d, components: [...d.components, { assessment_type_id: Number(e.target.value), weight: 0, max_score: 100, min_score: 0 }] })}>
            <option value="">+ Add assessment type…</option>
            {types.filter((t) => t.is_active && !d.components.some((c) => c.assessment_type_id === t.id)).map((t) => <option key={t.id} value={t.id}>{t.code} — {t.name}</option>)}
          </select>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">Letter grading scale</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {d.scale.map((s, i) => (
              <div key={i} className="flex items-center gap-1.5 rounded-lg border border-line p-2">
                <input className="input h-8 w-14 font-semibold" value={s.letter} onChange={(e) => setScale(i, "letter", e.target.value)} aria-label="Letter" />
                <span className="text-xs text-muted">≥</span><input type="number" className="input h-8 w-16" value={s.min} onChange={(e) => setScale(i, "min", e.target.value)} aria-label="Minimum" />
                <span className="text-xs text-muted">pts</span><input type="number" step="0.1" className="input h-8 w-16" value={s.points} onChange={(e) => setScale(i, "points", e.target.value)} aria-label="Grade points" />
                <button className="btn btn-ghost btn-sm text-bad" onClick={() => setD({ ...d, scale: d.scale.filter((_, j) => j !== i) })} aria-label="Remove"><Trash2 size={13} /></button>
              </div>))}
          </div>
          <button className="btn btn-sm mt-2" onClick={() => setD({ ...d, scale: [...d.scale, { letter: "", min: 0, points: 0 }] })}><Plus size={14} />Add grade</button>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <p className="text-xs text-muted">Preview: 75% on every component → total <b className="text-fg">{preview.total ?? "—"}</b>, grade <b className="text-fg">{preview.letter ?? "—"}</b> ({preview.status})</p>
          {d.id > 0 && d.courses > 0 && <p className="text-xs text-warn">Saving recalculates results of courses in unlocked semesters. Locked semesters keep their stored results.</p>}
          <button className="btn btn-primary ml-auto" disabled={busy || !d.name.trim()} onClick={save}>{busy ? "Saving…" : d.id ? "Save scheme" : "Create scheme"}</button>
        </div>
      </div>
    </div>
  );
}
