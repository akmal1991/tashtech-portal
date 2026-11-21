"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { MessageSquare, Clock, Check, Loader2 } from "lucide-react";
import { api } from "@/lib/client";
import { Modal, useToast } from "@/components/client-ui";

type Comp = { typeId: number; code: string; name: string; max: number; weight: number; retake: boolean };
type Row = {
  enrollmentId: number; studentId: number; number: string; name: string; withdrawn: boolean; total: number | null; letter: string | null;
  result: string; needsRetake: boolean; attendance: number | null; comment: string | null; marks: Record<number, number | null>;
  pending: Record<number, { score: number | null; by: string; reason: string }>;
};
type CellState = "saving" | "saved" | "pending" | "error";

export function GradeSheet({ rows, components, canEdit, locked, canOverride, canEditDirect, requireReason, canManage }: {
  rows: Row[]; components: Comp[]; canEdit: boolean; locked: boolean; canOverride: boolean; canEditDirect: boolean; requireReason: boolean; canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [state, setState] = useState<Record<string, CellState>>({});
  const [reasonFor, setReasonFor] = useState<{ row: Row; comp: Comp; value: number | null; old: number | null } | null>(null);
  const [reason, setReason] = useState("");
  const [commentFor, setCommentFor] = useState<Row | null>(null);
  const [comment, setComment] = useState("");
  const key = (r: Row, c: Comp) => `${r.enrollmentId}:${c.typeId}`;

  // After a server refresh, drop local edits that the server now reflects; keep anything still being typed.
  useEffect(() => {
    setValues((v) => Object.fromEntries(Object.entries(v).filter(([k, val]) => {
      const [e, t] = k.split(":").map(Number);
      const server = rows.find((r) => r.enrollmentId === e)?.marks[t];
      const parsed = val.trim() === "" ? null : Number(val.replace(",", "."));
      return parsed !== (server ?? null) && state[k] !== "saved" && state[k] !== "pending";
    })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const display = (r: Row, c: Comp) => values[key(r, c)] ?? (r.marks[c.typeId] != null ? String(r.marks[c.typeId]) : "");

  async function save(r: Row, c: Comp, value: number | null, why: string | null) {
    const k = key(r, c);
    setState((s) => ({ ...s, [k]: "saving" }));
    try {
      const res = await api<{ status: string; message: string }>("/api/grades", { body: { enrollmentId: r.enrollmentId, assessmentTypeId: c.typeId, score: value, reason: why } });
      setState((s) => ({ ...s, [k]: res.status === "pending" ? "pending" : "saved" }));
      if (res.status === "pending") toast("info", res.message);
      router.refresh();
    } catch (e) {
      setState((s) => ({ ...s, [k]: "error" }));
      toast("error", (e as Error).message);
    }
  }

  function commit(r: Row, c: Comp) {
    const k = key(r, c);
    const raw = values[k];
    if (raw === undefined) return;
    const old = r.marks[c.typeId] ?? null;
    const value = raw.trim() === "" ? null : Number(raw.replace(",", "."));
    if (value !== null && (Number.isNaN(value) || value < 0 || value > c.max)) {
      toast("error", `${c.code} must be between 0 and ${c.max}`);
      setState((s) => ({ ...s, [k]: "error" }));
      return;
    }
    if (value === old) { setValues((v) => { const n = { ...v }; delete n[k]; return n; }); return; }
    if (value === null && old === null) return;
    const needsReason = requireReason && (old !== null || locked);
    if (needsReason) { setReason(""); setReasonFor({ row: r, comp: c, value, old }); return; }
    save(r, c, value, null);
  }

  const willNeedApproval = (old: number | null) => (locked && !canOverride) || (old !== null && !canEditDirect);
  const readOnly = !canEdit;

  return (
    <>
      <div className="card overflow-hidden">
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th className="w-8 text-right">#</th><th>Student</th>
                {components.map((c) => <th key={c.typeId} className="text-right" title={c.name}>{c.code}<div className="text-[10px] font-normal normal-case text-muted">{c.retake ? "retake" : `${c.weight}%`} · /{c.max}</div></th>)}
                <th className="text-right">Att.</th><th className="text-right">Total</th><th>Grade</th><th>Result</th><th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.enrollmentId} className={clsx(r.withdrawn && "opacity-50")}>
                  <td className="text-right text-xs text-muted tabular">{i + 1}</td>
                  <td className="min-w-48"><Link href={`/students/${r.studentId}`} className="link">{r.name}</Link><div className="font-mono text-xs text-muted">{r.number}{r.withdrawn && " · withdrawn"}</div></td>
                  {components.map((c) => {
                    const k = key(r, c);
                    const p = r.pending[c.typeId];
                    const st = state[k];
                    const showRetake = !c.retake || r.result === "failed" || r.marks[c.typeId] != null;
                    return (
                      <td key={c.typeId} className="text-right">
                        <div className="relative inline-flex items-center gap-1">
                          {p && <span title={`Pending approval: ${p.score ?? "delete"} (by ${p.by}) — ${p.reason}`}><Clock size={13} className="text-warn" /></span>}
                          {readOnly || r.withdrawn || (!showRetake && r.marks[c.typeId] == null) ? (
                            <span className="grade-input inline-block tabular">{r.marks[c.typeId] ?? <span className="text-muted/50">{c.retake && !showRetake ? "" : "·"}</span>}</span>
                          ) : (
                            <input
                              aria-label={`${c.code} for ${r.name}`}
                              inputMode="decimal"
                              className={clsx("input grade-input h-8 px-2 py-1", st === "error" && "border-bad", st === "saved" && "border-ok", (st === "pending" || p) && "border-warn")}
                              value={display(r, c)}
                              onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
                              onBlur={() => commit(r, c)}
                              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setValues((v) => { const n = { ...v }; delete n[k]; return n; }); }}
                              title={willNeedApproval(r.marks[c.typeId] ?? null) ? "Changes require approval" : undefined}
                            />
                          )}
                          <span className="w-3">{st === "saving" ? <Loader2 size={12} className="animate-spin text-muted" /> : st === "saved" ? <Check size={12} className="text-ok" /> : null}</span>
                        </div>
                      </td>
                    );
                  })}
                  <td className="text-right text-xs tabular">{r.attendance != null ? `${Math.round(r.attendance)}%` : "—"}</td>
                  <td className="text-right font-semibold tabular">{r.total?.toFixed(1) ?? "—"}</td>
                  <td className="font-semibold">{r.letter ?? "—"}</td>
                  <td>{r.result === "passed" ? <span className="badge badge-green">Passed</span> : r.result === "failed" ? <span className={clsx("badge", r.needsRetake ? "badge-amber" : "badge-red")}>{r.needsRetake ? "Retake" : "Failed"}</span> : <span className="badge badge-gray">In progress</span>}</td>
                  <td>{canEdit && <button className={clsx("btn btn-ghost btn-sm", r.comment && "text-brand")} title={r.comment ?? "Add instructor comment"} onClick={() => { setComment(r.comment ?? ""); setCommentFor(r); }}><MessageSquare size={14} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <div className="py-10 text-center text-sm text-muted">No students enrolled{canManage ? " — use Enroll students" : ""}.</div>}
      </div>
      {canEdit && <p className="mt-2 text-xs text-muted">Type a mark and press Enter or Tab to save. Clear a cell to delete a mark. Empty cells mean the mark has not been entered yet. Every change is recorded in the grade history.</p>}

      <Modal open={!!reasonFor} onClose={() => setReasonFor(null)} title="Reason for grade change"
        footer={<>
          <button className="btn" onClick={() => { if (reasonFor) setValues((v) => { const n = { ...v }; delete n[key(reasonFor.row, reasonFor.comp)]; return n; }); setReasonFor(null); }}>Cancel</button>
          <button className="btn btn-primary" disabled={reason.trim().length < 3} onClick={() => { if (reasonFor) save(reasonFor.row, reasonFor.comp, reasonFor.value, reason.trim()); setReasonFor(null); }}>
            {reasonFor && willNeedApproval(reasonFor.old) ? "Submit for approval" : "Save change"}
          </button>
        </>}>
        {reasonFor && (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg bg-surface-2 p-3">
              <div className="font-medium">{reasonFor.row.name} · {reasonFor.comp.name}</div>
              <div className="mt-1 tabular"><span className="text-muted">{reasonFor.old ?? "—"}</span> → <b>{reasonFor.value ?? "deleted"}</b></div>
            </div>
            {willNeedApproval(reasonFor.old) && <p className="text-warn">{locked && !canOverride ? "The semester is locked." : "Modifying an existing mark requires approval."} The change will be applied after an administrator approves it.</p>}
            <div><label className="label">Reason (required, recorded in the audit trail)</label><textarea autoFocus className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Re-marking after student appeal" /></div>
          </div>
        )}
      </Modal>

      <Modal open={!!commentFor} onClose={() => setCommentFor(null)} title={`Instructor comment — ${commentFor?.name ?? ""}`}
        footer={<>
          <button className="btn" onClick={() => setCommentFor(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={async () => {
            try { await api(`/api/enrollments/${commentFor!.enrollmentId}`, { method: "PUT", body: { comment: comment.trim() || null } }); toast("ok", "Comment saved"); setCommentFor(null); router.refresh(); }
            catch (e) { toast("error", (e as Error).message); }
          }}>Save</button>
        </>}>
        <textarea className="input" rows={4} value={comment} onChange={(e) => setComment(e.target.value)} />
      </Modal>
    </>
  );
}
