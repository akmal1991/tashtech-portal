"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { api } from "@/lib/client";
import { useToast } from "@/components/client-ui";

type Student = { enrollment_id: number; student_number: string; name: string; attendance_pct: number | null };
type Session = { session_date: string; present: number; total: number };
const STATUSES = ["present", "late", "excused", "absent"] as const;
const tone: Record<string, string> = { present: "bg-ok text-white", late: "bg-warn text-white", excused: "bg-brand text-white", absent: "bg-bad text-white" };

export function AttendanceSheet({ courseId, students, sessions, canEdit }: { courseId: number; students: Student[]; sessions: Session[]; canEdit: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [marks, setMarks] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ records: { enrollment_id: number; status: string }[] }>(`/api/courses/${courseId}/attendance?date=${date}`)
      .then((d) => setMarks(Object.fromEntries(d.records.map((r) => [r.enrollment_id, r.status]))))
      .catch((e) => toast("error", e.message));
  }, [date, courseId, toast]);

  const save = async () => {
    setBusy(true);
    try {
      const records = students.map((s) => ({ enrollmentId: s.enrollment_id, status: marks[s.enrollment_id] ?? "present" }));
      await api(`/api/courses/${courseId}/attendance`, { body: { date, records } });
      toast("ok", `Attendance saved for ${date}`);
      router.refresh();
    } catch (e) { toast("error", (e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <label className="text-sm font-medium" htmlFor="date">Session date</label>
          <input id="date" type="date" className="input h-9 w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
          {canEdit && <>
            <button className="btn btn-sm" onClick={() => setMarks(Object.fromEntries(students.map((s) => [s.enrollment_id, "present"])))}>Mark all present</button>
            <button className="btn btn-primary btn-sm ml-auto" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save attendance"}</button>
          </>}
        </div>
        <div className="scroll-x"><table className="table">
          <thead><tr><th>Student</th><th>Status</th><th className="text-right">Overall</th></tr></thead>
          <tbody>{students.map((s) => (
            <tr key={s.enrollment_id}>
              <td>{s.name}<div className="font-mono text-xs text-muted">{s.student_number}</div></td>
              <td><div className="flex flex-wrap gap-1">{STATUSES.map((st) => (
                <button key={st} disabled={!canEdit} onClick={() => setMarks((m) => ({ ...m, [s.enrollment_id]: st }))}
                  className={clsx("rounded-md border border-line px-2 py-1 text-xs capitalize", (marks[s.enrollment_id] ?? (canEdit ? "" : "")) === st ? tone[st] : "bg-surface text-muted hover:bg-surface-2")}>{st}</button>
              ))}</div></td>
              <td className="text-right tabular">{s.attendance_pct != null ? `${Math.round(s.attendance_pct)}%` : "—"}</td>
            </tr>))}</tbody>
        </table></div>
      </div>
      <div className="card">
        <div className="border-b border-line px-4 py-3 text-sm font-semibold">Recorded sessions</div>
        <ul className="max-h-[520px] overflow-y-auto">
          {sessions.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">No sessions yet</li>}
          {sessions.map((s) => (
            <li key={s.session_date}><button onClick={() => setDate(s.session_date)} className={clsx("flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-surface-2", s.session_date === date && "bg-surface-2 font-medium")}>
              <span>{s.session_date}</span><span className="tabular text-muted">{s.present}/{s.total}</span></button></li>
          ))}
        </ul>
      </div>
    </div>
  );
}
