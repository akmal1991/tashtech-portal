"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Plus, Trash2 } from "lucide-react";
import { PERMISSIONS } from "@/lib/permissions";
import { api } from "@/lib/client";
import { ConfirmDialog, useToast } from "@/components/client-ui";

type Role = { id: number; name: string; description: string | null; is_system: boolean; users: number; permissions: string[] };
const categories = [...new Set(PERMISSIONS.map((p) => p.category))];

export function RoleManager({ roles }: { roles: Role[] }) {
  const router = useRouter();
  const toast = useToast();
  const [sel, setSel] = useState<Role | null>(roles[0] ?? null);
  const [draft, setDraft] = useState<Role | null>(roles[0] ? { ...roles[0] } : null);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  const pick = (r: Role | null) => { setSel(r); setDraft(r ? { ...r, permissions: [...r.permissions] } : { id: 0, name: "", description: "", is_system: false, users: 0, permissions: [] }); };
  const toggle = (code: string) => setDraft((d) => d && ({ ...d, permissions: d.permissions.includes(code) ? d.permissions.filter((p) => p !== code) : [...d.permissions, code] }));
  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const body = { name: draft.name, description: draft.description, permissions: draft.permissions };
      if (draft.id) await api(`/api/admin/roles/${draft.id}`, { method: "PUT", body }); else await api("/api/admin/roles", { body });
      toast("ok", "Role saved"); router.refresh();
    } catch (e) { toast("error", (e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
      <div className="card overflow-hidden">
        <ul>{roles.map((r) => (
          <li key={r.id}><button onClick={() => pick(r)} className={clsx("flex w-full items-center justify-between border-b border-line px-4 py-3 text-left text-sm hover:bg-surface-2", sel?.id === r.id && "bg-surface-2 font-semibold")}>
            <span>{r.name}{r.is_system && <span className="ml-1 text-xs font-normal text-muted">(built-in)</span>}</span><span className="text-xs text-muted">{r.users} users</span></button></li>
        ))}</ul>
        <button className="btn btn-ghost w-full rounded-none" onClick={() => pick(null)}><Plus size={16} />New role</button>
      </div>
      {draft && (
        <div className="card card-pad">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Role name</label><input className="input" value={draft.name} disabled={draft.is_system} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
            <div><label className="label">Description</label><input className="input" value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
          </div>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            {categories.map((cat) => (
              <fieldset key={cat}>
                <legend className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{cat}</legend>
                <div className="space-y-1.5">{PERMISSIONS.filter((p) => p.category === cat).map((p) => (
                  <label key={p.code} className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-0.5" checked={draft.permissions.includes(p.code)} onChange={() => toggle(p.code)} />
                    <span>{p.description}<span className="block font-mono text-[11px] text-muted">{p.code}</span></span>
                  </label>))}</div>
              </fieldset>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-4">
            {draft.id > 0 && !draft.is_system && <button className="btn text-bad" onClick={() => setDel(true)}><Trash2 size={15} />Delete role</button>}
            <span className="ml-auto text-xs text-muted self-center">{draft.permissions.length} permission(s)</span>
            <button className="btn btn-primary" disabled={busy || !draft.name.trim()} onClick={save}>{busy ? "Saving…" : draft.id ? "Save role" : "Create role"}</button>
          </div>
        </div>
      )}
      <ConfirmDialog open={del} onClose={() => setDel(false)} busy={busy} title="Delete role" confirmText="Delete" message={`Delete the role “${draft?.name}”? Roles still assigned to users cannot be deleted.`}
        onConfirm={async () => { setBusy(true); try { await api(`/api/admin/roles/${draft!.id}`, { method: "DELETE" }); toast("ok", "Role deleted"); setDel(false); pick(roles[0]); router.refresh(); } catch (e) { toast("error", (e as Error).message); } finally { setBusy(false); } }} />
    </div>
  );
}
