"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Database, Download, RotateCcw } from "lucide-react";
import { api } from "@/lib/client";
import { ConfirmDialog, useToast } from "@/components/client-ui";

function useSave() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const save = async (key: string, value: unknown, msg = "Settings saved") => {
    setBusy(true);
    try { await api("/api/admin/settings", { method: "PUT", body: { key, value } }); toast("ok", msg); router.refresh(); }
    catch (e) { toast("error", (e as Error).message); } finally { setBusy(false); }
  };
  return { save, busy };
}

export function ToggleGroup({ settingKey, items, value }: { settingKey: string; items: { key: string; label: string; help?: string }[]; value: Record<string, boolean> }) {
  const [v, setV] = useState(value);
  const { save, busy } = useSave();
  return (
    <div className="space-y-3">
      {items.map((i) => (
        <label key={i.key} className="flex items-start gap-3">
          <input type="checkbox" className="mt-1" checked={v[i.key] !== false} onChange={(e) => setV((x) => ({ ...x, [i.key]: e.target.checked }))} />
          <span><span className="text-sm font-medium">{i.label}</span>{i.help && <span className="block text-xs text-muted">{i.help}</span>}</span>
        </label>
      ))}
      <button className="btn btn-primary" disabled={busy} onClick={() => save(settingKey, Object.fromEntries(items.map((i) => [i.key, v[i.key] !== false])))}>Save</button>
    </div>
  );
}

export function BrandingForm({ value }: { value: { name: string; shortName: string; tagline: string; primaryColor: string; accentColor: string; logoDataUrl: string | null } }) {
  const [v, setV] = useState(value);
  const { save, busy } = useSave();
  const toast = useToast();
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="label">Institution name</label><input className="input" value={v.name} onChange={set("name")} /></div>
        <div><label className="label">Short name</label><input className="input" value={v.shortName} onChange={set("shortName")} /></div>
        <div><label className="label">Tagline</label><input className="input" value={v.tagline} onChange={set("tagline")} /></div>
        <div><label className="label">Primary colour</label><div className="flex gap-2"><input type="color" className="h-9 w-12 rounded border border-line" value={v.primaryColor} onChange={set("primaryColor")} /><input className="input" value={v.primaryColor} onChange={set("primaryColor")} /></div></div>
        <div><label className="label">Accent colour</label><div className="flex gap-2"><input type="color" className="h-9 w-12 rounded border border-line" value={v.accentColor} onChange={set("accentColor")} /><input className="input" value={v.accentColor} onChange={set("accentColor")} /></div></div>
      </div>
      <div>
        <label className="label">Logo (PNG/JPEG/SVG/WebP, max 300 KB)</label>
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {v.logoDataUrl ? <img src={v.logoDataUrl} alt="Logo preview" className="h-12 w-12 rounded border border-line object-contain" /> : <div className="grid h-12 w-12 place-items-center rounded bg-brand text-xs text-white">Logo</div>}
          <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="text-sm" onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (f.size > 300_000) return toast("error", "Logo must be smaller than 300 KB");
            const r = new FileReader();
            r.onload = () => setV((x) => ({ ...x, logoDataUrl: String(r.result) }));
            r.readAsDataURL(f);
          }} />
          {v.logoDataUrl && <button className="btn btn-sm" onClick={() => setV((x) => ({ ...x, logoDataUrl: null }))}>Remove</button>}
        </div>
      </div>
      <button className="btn btn-primary" disabled={busy} onClick={() => save("branding", v, "Branding updated")}>Save branding</button>
    </div>
  );
}

export function DashboardWidgets({ all, value }: { all: { key: string; label: string }[]; value: string[] }) {
  const [order, setOrder] = useState<string[]>([...value, ...all.map((a) => a.key).filter((k) => !value.includes(k))]);
  const [on, setOn] = useState<Set<string>>(new Set(value));
  const { save, busy } = useSave();
  const move = (i: number, d: number) => setOrder((o) => { const n = [...o]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });
  return (
    <div className="space-y-2">
      {order.map((k, i) => (
        <div key={k} className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5">
          <input type="checkbox" checked={on.has(k)} onChange={(e) => setOn((s) => { const n = new Set(s); if (e.target.checked) n.add(k); else n.delete(k); return n; })} />
          <span className="flex-1 text-sm">{all.find((a) => a.key === k)?.label ?? k}</span>
          <button className="btn btn-ghost btn-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp size={14} /></button>
          <button className="btn btn-ghost btn-sm" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown size={14} /></button>
        </div>
      ))}
      <button className="btn btn-primary" disabled={busy} onClick={() => save("dashboard", { widgets: order.filter((k) => on.has(k)) }, "Dashboard updated")}>Save dashboard</button>
    </div>
  );
}

export function NumberSettings({ settingKey, fields, value, extraBool }: { settingKey: string; fields: { key: string; label: string; min: number; max: number }[]; value: Record<string, number | boolean>; extraBool?: { key: string; label: string } }) {
  const [v, setV] = useState(value);
  const { save, busy } = useSave();
  return (
    <div className="space-y-3">
      {extraBool && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!v[extraBool.key]} onChange={(e) => setV((x) => ({ ...x, [extraBool.key]: e.target.checked }))} />{extraBool.label}</label>}
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => <div key={f.key}><label className="label">{f.label}</label><input type="number" min={f.min} max={f.max} className="input" value={v[f.key] as number} onChange={(e) => setV((x) => ({ ...x, [f.key]: Number(e.target.value) }))} /></div>)}
      </div>
      <button className="btn btn-primary" disabled={busy} onClick={() => save(settingKey, v)}>Save</button>
    </div>
  );
}

type Backup = { id: number; file_name: string; size_bytes: number; kind: string; created_at: string; full_name: string | null };
export function BackupPanel({ backups, canRestore }: { backups: Backup[]; canRestore: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [restore, setRestore] = useState<string | null>(null);
  return (
    <div>
      <button className="btn btn-primary mb-3" disabled={busy} onClick={async () => {
        setBusy(true);
        try { const r = await api<{ name: string }>("/api/admin/backups", { method: "POST" }); toast("ok", `Backup created: ${r.name}`); router.refresh(); }
        catch (e) { toast("error", (e as Error).message); } finally { setBusy(false); }
      }}><Database size={16} />{busy ? "Working…" : "Create backup now"}</button>
      <div className="scroll-x max-h-80 overflow-y-auto rounded-lg border border-line"><table className="table">
        <thead><tr><th>Created</th><th>Type</th><th className="text-right">Size</th><th>By</th><th /></tr></thead>
        <tbody>{backups.map((b) => (
          <tr key={b.id}>
            <td className="whitespace-nowrap text-xs">{new Date(b.created_at).toLocaleString("en-GB")}</td>
            <td><span className="badge badge-gray">{b.kind}</span></td>
            <td className="text-right tabular text-xs">{(b.size_bytes / 1024 / 1024).toFixed(2)} MB</td>
            <td className="text-xs">{b.full_name ?? "Scheduler"}</td>
            <td className="whitespace-nowrap text-right">
              <a className="btn btn-ghost btn-sm" href={`/api/admin/backups/${b.file_name}`} aria-label="Download"><Download size={14} /></a>
              {canRestore && <button className="btn btn-ghost btn-sm text-bad" onClick={() => setRestore(b.file_name)} aria-label="Restore"><RotateCcw size={14} /></button>}
            </td>
          </tr>))}
          {backups.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-sm text-muted">No backups yet</td></tr>}</tbody>
      </table></div>
      <ConfirmDialog open={!!restore} onClose={() => setRestore(null)} busy={busy} title="Restore database from backup" confirmText="Restore" requireText={restore ?? ""}
        message={<>This replaces <b>all current data</b> with the contents of the backup. A safety backup of the current state is created first. All users will be signed out.</>}
        onConfirm={async () => {
          setBusy(true);
          try { await api(`/api/admin/backups/${restore}`, { body: { confirm: restore } }); toast("ok", "Database restored. Please sign in again."); window.location.href = "/login"; }
          catch (e) { toast("error", (e as Error).message); setBusy(false); }
        }} />
    </div>
  );
}
