"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { ENTITIES, type EntityKey, type FieldDef } from "@/lib/entities";
import { api } from "@/lib/client";
import { ConfirmDialog, Modal, useToast } from "./client-ui";

type Row = Record<string, unknown> & { id: number };

export function EntityManager({ entity }: { entity: EntityKey }) {
  const def = ENTITIES[entity];
  const fields = def.fields as FieldDef[];
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [refs, setRefs] = useState<Record<string, { id: number; label: string }[]>>({});
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [del, setDel] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await api<{ rows: Row[] }>(`/api/admin/entities/${entity}`)).rows); } catch (e) { toast("error", (e as Error).message); }
    setLoading(false);
  }, [entity, toast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const refKeys = [...new Set(fields.filter((f) => f.type === "ref").map((f) => f.ref!))];
    Promise.all(refKeys.map((r) => api<{ rows: { id: number; label: string }[] }>(`/api/admin/entities/${r}?options=1`).then((d) => [r, d.rows] as const)))
      .then((pairs) => setRefs(Object.fromEntries(pairs))).catch(() => {});
  }, [entity, fields]);

  const label = (f: FieldDef, v: unknown) => {
    if (v == null || v === "") return "—";
    if (f.type === "ref") return refs[f.ref!]?.find((r) => r.id === v)?.label ?? `#${v}`;
    if (f.type === "boolean") return v ? "Yes" : "No";
    return String(v);
  };
  const shown = useMemo(() => {
    const t = q.toLowerCase();
    return t ? rows.filter((r) => fields.some((f) => label(f, r[f.name]).toLowerCase().includes(t))) : rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, refs]);

  const open = (r: Row | null) => {
    setEditing(r ?? ({ id: 0 } as Row));
    setForm(r ? Object.fromEntries(fields.map((f) => [f.name, r[f.name] ?? (f.type === "boolean" ? false : "")])) : Object.fromEntries(fields.map((f) => [f.name, f.type === "boolean" ? f.name === "is_active" : ""])));
  };
  const save = async () => {
    setBusy(true);
    try {
      if (editing?.id) await api(`/api/admin/entities/${entity}/${editing.id}`, { method: "PUT", body: form });
      else await api(`/api/admin/entities/${entity}`, { body: form });
      toast("ok", `${def.singular} saved`);
      setEditing(null); await load(); router.refresh();
    } catch (e) { toast("error", (e as Error).message); } finally { setBusy(false); }
  };
  const input = (f: FieldDef) => {
    const v = form[f.name];
    const on = (val: unknown) => setForm((x) => ({ ...x, [f.name]: val }));
    if (f.type === "boolean") return <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!v} onChange={(e) => on(e.target.checked)} />{f.label}</label>;
    if (f.type === "textarea") return <textarea className="input font-mono text-xs" rows={8} value={(v as string) ?? ""} onChange={(e) => on(e.target.value)} />;
    if (f.type === "select") return <select className="input" value={(v as string) ?? ""} onChange={(e) => on(e.target.value)}><option value="">—</option>{f.options!.map((o) => <option key={o}>{o}</option>)}</select>;
    if (f.type === "ref") return <select className="input" value={(v as number) ?? ""} onChange={(e) => on(e.target.value)}><option value="">—</option>{(refs[f.ref!] ?? []).filter((o) => o.id !== editing?.id || f.ref !== entity).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>;
    return <input className="input" type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} step="any" value={(v as string) ?? ""} onChange={(e) => on(e.target.value)} />;
  };
  const listFields = fields.filter((f) => f.list !== false);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <div className="relative max-w-xs flex-1"><Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted" /><input className="input h-9 pl-8" placeholder={`Search ${def.label.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <span className="text-xs text-muted">{shown.length} record(s)</span>
        <button className="btn btn-primary ml-auto" onClick={() => open(null)}><Plus size={16} />Add {def.singular.toLowerCase()}</button>
      </div>
      <div className="scroll-x max-h-[620px] overflow-y-auto">
        <table className="table">
          <thead><tr>{listFields.map((f) => <th key={f.name}>{f.label.replace(/\s*\(.*\)/, "")}</th>)}<th className="w-24" /></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={listFields.length + 1} className="py-8 text-center text-muted">Loading…</td></tr>}
            {!loading && shown.map((r) => (
              <tr key={r.id}>
                {listFields.map((f) => <td key={f.name} className={f.type === "boolean" ? "" : "max-w-64 truncate"}>{f.type === "boolean" ? (r[f.name] ? <span className="badge badge-green">Yes</span> : <span className="badge badge-gray">No</span>) : label(f, r[f.name])}</td>)}
                <td className="whitespace-nowrap text-right">
                  <button className="btn btn-ghost btn-sm" onClick={() => open(r)} aria-label="Edit"><Pencil size={14} /></button>
                  <button className="btn btn-ghost btn-sm text-bad" onClick={() => setDel(r)} aria-label="Delete"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
            {!loading && shown.length === 0 && <tr><td colSpan={listFields.length + 1} className="py-8 text-center text-muted">No records</td></tr>}
          </tbody>
        </table>
      </div>
      <Modal open={!!editing} onClose={() => setEditing(null)} wide={fields.some((f) => f.type === "textarea")} title={editing?.id ? `Edit ${def.singular.toLowerCase()}` : `New ${def.singular.toLowerCase()}`}
        footer={<><button className="btn" onClick={() => setEditing(null)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.name} className={f.type === "textarea" || f.help ? "sm:col-span-2" : ""}>
              {f.type !== "boolean" && <label className="label">{f.label}{f.required && " *"}</label>}
              {input(f)}
              {f.help && <p className="mt-1 text-xs text-muted">{f.help}</p>}
            </div>
          ))}
        </div>
      </Modal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} busy={busy} title={`Delete ${def.singular.toLowerCase()}`} confirmText="Delete"
        message={<>Delete <b>{del ? label(fields[0], del[fields[0].name]) + (fields[1] ? ` — ${label(fields[1], del[fields[1].name])}` : "") : ""}</b>? Records that are still referenced (students, courses, marks) cannot be deleted.</>}
        requireText="DELETE"
        onConfirm={async () => {
          setBusy(true);
          try { await api(`/api/admin/entities/${entity}/${del!.id}`, { method: "DELETE" }); toast("ok", "Deleted"); setDel(null); await load(); }
          catch (e) { toast("error", (e as Error).message); } finally { setBusy(false); }
        }} />
    </div>
  );
}
