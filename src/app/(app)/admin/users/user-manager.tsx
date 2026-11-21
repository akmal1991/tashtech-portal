"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Search } from "lucide-react";
import { api, fmtDateTime } from "@/lib/client";
import { Modal, useToast } from "@/components/client-ui";

type U = { id: number; username: string; full_name: string; email: string | null; role_id: number; role_name: string; faculty_id: number | null; faculty_name: string | null; is_active: boolean; last_login_at: string | null; locked_until: string | null; course_ids: number[] };
type Opt = { id: number; name: string; is_current?: boolean };

export function UserManager({ users, roles, faculties, courses, selfId }: { users: U[]; roles: Opt[]; faculties: Opt[]; courses: Opt[]; selfId: number }) {
  const router = useRouter();
  const toast = useToast();
  const [edit, setEdit] = useState<Partial<U> & { password?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [cq, setCq] = useState("");
  const shown = users.filter((u) => !q || `${u.full_name} ${u.username} ${u.role_name}`.toLowerCase().includes(q.toLowerCase()));
  const courseList = useMemo(() => courses.filter((c) => !cq || c.name.toLowerCase().includes(cq.toLowerCase())).slice(0, 200), [courses, cq]);

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    try {
      const body = { username: edit.username, full_name: edit.full_name, email: edit.email ?? "", role_id: Number(edit.role_id), faculty_id: edit.faculty_id ? Number(edit.faculty_id) : null,
        is_active: edit.is_active ?? true, password: edit.password || undefined, course_ids: edit.course_ids ?? [] };
      if (edit.id) await api(`/api/admin/users/${edit.id}`, { method: "PUT", body }); else await api("/api/admin/users", { body });
      toast("ok", "User saved"); setEdit(null); router.refresh();
    } catch (e) { toast("error", (e as Error).message); } finally { setBusy(false); }
  };
  const set = (k: string, v: unknown) => setEdit((x) => ({ ...x!, [k]: v }));

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <div className="relative max-w-xs flex-1"><Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" /><input className="input h-9 pl-8" placeholder="Search users…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <button className="btn btn-primary ml-auto" onClick={() => setEdit({ is_active: true, role_id: roles[0]?.id, course_ids: [] })}><Plus size={16} />New user</button>
      </div>
      <div className="scroll-x"><table className="table">
        <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Scope</th><th className="text-right">Courses</th><th>Last sign-in</th><th>Status</th><th /></tr></thead>
        <tbody>{shown.map((u) => (
          <tr key={u.id}>
            <td><div className="font-medium">{u.full_name}</div><div className="text-xs text-muted">{u.email}</div></td>
            <td className="font-mono text-xs">{u.username}</td><td>{u.role_name}</td><td className="text-xs">{u.faculty_name ?? "All faculties"}</td>
            <td className="text-right tabular">{u.course_ids.length || "—"}</td>
            <td className="whitespace-nowrap text-xs">{fmtDateTime(u.last_login_at)}</td>
            <td>{!u.is_active ? <span className="badge badge-red">Inactive</span> : u.locked_until && new Date(u.locked_until) > new Date() ? <span className="badge badge-amber">Locked</span> : <span className="badge badge-green">Active</span>}</td>
            <td><button className="btn btn-ghost btn-sm" onClick={() => setEdit({ ...u, password: "" })} aria-label="Edit"><Pencil size={14} /></button></td>
          </tr>))}</tbody>
      </table></div>
      <Modal open={!!edit} onClose={() => setEdit(null)} wide title={edit?.id ? `Edit ${edit.full_name}` : "New user"}
        footer={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button></>}>
        {edit && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div><label className="label">Full name *</label><input className="input" value={edit.full_name ?? ""} onChange={(e) => set("full_name", e.target.value)} /></div>
              <div><label className="label">Username *</label><input className="input" value={edit.username ?? ""} onChange={(e) => set("username", e.target.value)} autoComplete="off" /></div>
              <div><label className="label">Email</label><input className="input" type="email" value={edit.email ?? ""} onChange={(e) => set("email", e.target.value)} /></div>
              <div><label className="label">Role *</label><select className="input" value={edit.role_id ?? ""} disabled={edit.id === selfId} onChange={(e) => set("role_id", e.target.value)}>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
              <div><label className="label">Data scope</label><select className="input" value={edit.faculty_id ?? ""} onChange={(e) => set("faculty_id", e.target.value || null)}><option value="">All faculties</option>{faculties.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
              <div><label className="label">{edit.id ? "Reset password (leave blank to keep)" : "Password *"}</label><input className="input" type="password" autoComplete="new-password" value={edit.password ?? ""} onChange={(e) => set("password", e.target.value)} />
                <p className="mt-1 text-xs text-muted">Min. 10 characters, upper/lower case, digit and symbol. Resetting signs the user out everywhere.</p></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.is_active ?? true} disabled={edit.id === selfId} onChange={(e) => set("is_active", e.target.checked)} />Account active</label>
            </div>
            <div>
              <label className="label">Assigned courses ({edit.course_ids?.length ?? 0}) — for users without “Access all courses”</label>
              <input className="input mb-2 h-8" placeholder="Filter courses…" value={cq} onChange={(e) => setCq(e.target.value)} />
              <div className="max-h-[360px] space-y-0.5 overflow-y-auto rounded-lg border border-line p-2">
                {courseList.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={edit.course_ids?.includes(c.id) ?? false} onChange={(e) => set("course_ids", e.target.checked ? [...(edit.course_ids ?? []), c.id] : (edit.course_ids ?? []).filter((x) => x !== c.id))} />
                    <span className={c.is_current ? "font-medium" : "text-muted"}>{c.name}</span>
                  </label>))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
