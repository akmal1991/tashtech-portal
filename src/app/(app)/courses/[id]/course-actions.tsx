"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, RefreshCw, Settings2, UserPlus, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { ConfirmDialog, Modal, useToast } from "@/components/client-ui";

type Opt = { id: number; name: string };
type Op = { id: number; full_name: string; role: string };

export function CourseActions({ courseId, canSubmit, canRecalc, canManage, instructor, schemeId, groupId, locked, schemes, operators, assigned }: {
  courseId: number; canSubmit: boolean; canRecalc: boolean; canManage: boolean; instructor: string | null; schemeId: number; groupId: number | null; locked: boolean;
  schemes: Opt[]; operators: Op[]; assigned: number[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(false);
  const [enroll, setEnroll] = useState(false);
  const [del, setDel] = useState(false);
  const [ins, setIns] = useState(instructor ?? "");
  const [scheme, setScheme] = useState(schemeId);
  const [ops, setOps] = useState<number[]>(assigned);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ id: number; student_number: string; last_name: string; first_name: string; group_name: string }[]>([]);
  const [picked, setPicked] = useState<number[]>([]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast("ok", ok); router.refresh(); } catch (e) { toast("error", (e as Error).message); } finally { setBusy(false); }
  };

  return (
    <>
      {canSubmit && <button className="btn btn-primary" disabled={busy} onClick={() => run(() => api(`/api/courses/${courseId}/submit`, { method: "POST" }), "Grade sheet submitted — approvers notified")}><Send size={16} />Submit sheet</button>}
      {canRecalc && <button className="btn" disabled={busy} title="Recalculate totals with the current grading policy" onClick={() => run(() => api(`/api/courses/${courseId}/recalculate`, { method: "POST" }), "Results recalculated")}><RefreshCw size={16} /></button>}
      {canManage && <>
        <button className="btn" onClick={() => setEnroll(true)} title="Enroll students"><UserPlus size={16} /></button>
        <button className="btn" onClick={() => setEdit(true)} title="Course settings"><Settings2 size={16} /></button>
      </>}

      <Modal open={edit} onClose={() => setEdit(false)} title="Course settings" footer={<>
        <button className="btn text-bad mr-auto" onClick={() => { setEdit(false); setDel(true); }}><Trash2 size={15} />Delete course</button>
        <button className="btn" onClick={() => setEdit(false)}>Cancel</button>
        <button className="btn btn-primary" disabled={busy} onClick={() => run(() => api(`/api/courses/${courseId}`, { method: "PUT", body: { instructor: ins || null, grading_scheme_id: scheme, assigned_user_ids: ops } }), "Course updated").then(() => setEdit(false))}>Save</button>
      </>}>
        <div className="space-y-3">
          <div><label className="label">Instructor</label><input className="input" value={ins} onChange={(e) => setIns(e.target.value)} /></div>
          <div><label className="label">Grading scheme</label><select className="input" value={scheme} disabled={locked} onChange={(e) => setScheme(Number(e.target.value))}>{schemes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            {locked && <p className="mt-1 text-xs text-muted">Locked semester — the scheme cannot be changed.</p>}</div>
          <div><label className="label">Data entry operators assigned to this course</label>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
              {operators.map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ops.includes(o.id)} onChange={(e) => setOps((x) => e.target.checked ? [...x, o.id] : x.filter((y) => y !== o.id))} />{o.full_name}<span className="text-xs text-muted">{o.role}</span></label>
              ))}
            </div></div>
        </div>
      </Modal>

      <Modal open={enroll} onClose={() => setEnroll(false)} title="Enroll students" footer={<>
        {groupId && <button className="btn mr-auto" disabled={busy} onClick={() => run(() => api(`/api/courses/${courseId}/enroll`, { body: { groupId } }), "Group enrolled").then(() => setEnroll(false))}>Enroll whole group</button>}
        <button className="btn" onClick={() => setEnroll(false)}>Close</button>
        <button className="btn btn-primary" disabled={!picked.length || busy} onClick={() => run(() => api(`/api/courses/${courseId}/enroll`, { body: { studentIds: picked } }), `${picked.length} student(s) enrolled`).then(() => { setPicked([]); setEnroll(false); })}>Enroll {picked.length || ""}</button>
      </>}>
        <input className="input mb-2" placeholder="Search by name or student ID…" value={q} onChange={async (e) => {
          setQ(e.target.value);
          if (e.target.value.length >= 2) setFound((await api<{ rows: typeof found }>(`/api/students?q=${encodeURIComponent(e.target.value)}`)).rows);
        }} />
        <ul className="max-h-72 overflow-y-auto">
          {found.map((s) => (
            <li key={s.id}><label className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-2">
              <input type="checkbox" checked={picked.includes(s.id)} onChange={(e) => setPicked((x) => e.target.checked ? [...x, s.id] : x.filter((y) => y !== s.id))} />
              {s.last_name} {s.first_name}<span className="font-mono text-xs text-muted">{s.student_number}</span><span className="ml-auto text-xs text-muted">{s.group_name}</span>
            </label></li>
          ))}
          {q.length >= 2 && !found.length && <li className="py-4 text-center text-sm text-muted">No matches</li>}
        </ul>
      </Modal>

      <ConfirmDialog open={del} onClose={() => setDel(false)} busy={busy} title="Delete course" confirmText="Delete" requireText="DELETE"
        message="Courses with recorded marks cannot be deleted (their history is preserved). Empty courses and their enrollments will be removed."
        onConfirm={() => run(() => api(`/api/courses/${courseId}`, { method: "DELETE" }), "Course deleted").then(() => router.push("/courses"))} />
    </>
  );
}
