"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { FileSpreadsheet, Upload, Download, CheckCircle2, AlertTriangle } from "lucide-react";
import { api } from "@/lib/client";
import { useToast } from "@/components/client-ui";

type Change = { code: string; old: number | null; new: number | null; kind: string };
type Row = { row: number; action: string; label: string; errors: string[]; warnings: string[]; changes?: Change[] };
type Preview = { id: number; entity: string; total: number; valid: number; invalid: number; rows: Row[]; warnings: string[] };
type Summary = { total: number; imported: number; failed: number; skippedInvalid: number; created: number; updated: number; pendingApproval: number };

export function ImportWizard({ canStudents, canGrades }: { canStudents: boolean; canGrades: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [entity, setEntity] = useState(canStudents ? "students" : "grades");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [summary, setSummary] = useState<{ summary: Summary; results: { row: number; ok: boolean; error?: string; action?: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | "error" | "ok">("all");

  const upload = async () => {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file); fd.set("entity", entity);
    setBusy(true); setSummary(null);
    try { setPreview(await api<Preview>("/api/import/preview", { form: fd })); }
    catch (e) { toast("error", (e as Error).message); } finally { setBusy(false); }
  };
  const commit = async (cancel = false) => {
    if (!preview) return;
    setBusy(true);
    try {
      const r = await api<typeof summary & { cancelled?: boolean }>("/api/import/commit", { body: { id: preview.id, cancel } });
      if (cancel) { toast("info", "Import cancelled"); setPreview(null); }
      else { setSummary(r); setPreview(null); toast("ok", "Import finished"); }
      router.refresh();
    } catch (e) { toast("error", (e as Error).message); } finally { setBusy(false); }
  };
  const step = summary ? 3 : preview ? 2 : 1;
  const rows = preview?.rows.filter((r) => filter === "all" || (filter === "error" ? r.action === "error" : r.action !== "error")) ?? [];

  return (
    <div className="space-y-5">
      <ol className="flex flex-wrap gap-2 text-xs">
        {["Upload file", "Review & validate", "Summary"].map((l, i) => (
          <li key={l} className={clsx("flex items-center gap-2 rounded-full border px-3 py-1", step === i + 1 ? "border-brand bg-brand text-white" : step > i + 1 ? "border-ok/40 text-ok" : "border-line text-muted")}>{i + 1}. {l}</li>
        ))}
      </ol>

      {step === 1 && (
        <div className="card card-pad">
          <div className="grid gap-4 md:grid-cols-[220px_1fr_auto] md:items-end">
            <div><label className="label">What are you importing?</label>
              <select className="input" value={entity} onChange={(e) => setEntity(e.target.value)}>
                {canStudents && <option value="students">Student records</option>}
                {canGrades && <option value="grades">Grades / marks</option>}
              </select></div>
            <label className={clsx("flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed px-4 py-3 text-sm", file ? "border-brand/50 bg-brand/5" : "border-line hover:bg-surface-2")}>
              <FileSpreadsheet size={22} className="text-brand" />
              <span className="min-w-0 flex-1 truncate">{file ? `${file.name} (${Math.round(file.size / 1024)} KB)` : "Choose an .xlsx file (first sheet, header in row 1)"}</span>
              <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <button className="btn btn-primary" disabled={!file || busy} onClick={upload}><Upload size={16} />{busy ? "Validating…" : "Upload & validate"}</button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4 text-sm">
            <span className="text-muted">Templates:</span>
            {canStudents && <a className="link inline-flex items-center gap-1" href="/api/import/template?type=students"><Download size={14} />Student template</a>}
            {canGrades && <a className="link inline-flex items-center gap-1" href="/api/import/template?type=grades"><Download size={14} />Grades template</a>}
            <span className="text-xs text-muted">Students are matched by their unique Student ID — existing records are updated, new IDs are created.</span>
          </div>
        </div>
      )}

      {step === 2 && preview && (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
            <div className="text-sm"><b>{preview.total}</b> rows · <span className="text-ok">{preview.valid} valid</span> · <span className="text-bad">{preview.invalid} with errors</span></div>
            <select className="input h-8 w-auto" value={filter} onChange={(e) => setFilter(e.target.value as never)}>
              <option value="all">Show all</option><option value="error">Errors only</option><option value="ok">Valid only</option>
            </select>
            <div className="ml-auto flex gap-2">
              <button className="btn" disabled={busy} onClick={() => commit(true)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy || preview.valid === 0} onClick={() => commit(false)}>{busy ? "Importing…" : `Confirm import of ${preview.valid} row(s)`}</button>
            </div>
          </div>
          {preview.warnings.map((w) => <div key={w} className="border-b border-line bg-warn/10 px-5 py-2 text-sm text-warn">{w}</div>)}
          {preview.invalid > 0 && <div className="border-b border-line px-5 py-2 text-xs text-muted">Rows with errors will be skipped. Fix them in the file and import again, or continue with the valid rows.</div>}
          <div className="scroll-x max-h-[560px] overflow-y-auto"><table className="table">
            <thead><tr><th>Row</th><th>Record</th><th>Action</th><th>Details</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.row} className={r.action === "error" ? "bg-bad/5" : ""}>
                <td className="tabular">{r.row}</td>
                <td className="max-w-80">{r.label}</td>
                <td>{r.action === "error" ? <span className="badge badge-red">Error</span> : r.action === "create" ? <span className="badge badge-green">New</span> : r.action === "update" ? <span className="badge badge-blue">Update</span> : r.action === "skip" ? <span className="badge badge-gray">No change</span> : <span className="badge badge-blue">{r.changes?.length} mark(s)</span>}</td>
                <td className="text-xs">
                  {r.errors.map((e) => <div key={e} className="flex items-start gap-1 text-bad"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{e}</div>)}
                  {r.warnings.map((w) => <div key={w} className="text-warn">{w}</div>)}
                  {r.changes && r.changes.length > 0 && <div className="flex flex-wrap gap-1.5">{r.changes.map((c) => (
                    <span key={c.code} className={clsx("rounded border px-1.5 py-0.5 tabular", c.kind === "approval" ? "border-warn/50 text-warn" : c.kind === "new" ? "border-ok/40" : "border-line")}>
                      {c.code}: {c.old ?? "—"}→{c.new ?? "del"}{c.kind === "approval" && " (approval)"}</span>))}</div>}
                </td>
              </tr>))}</tbody>
          </table></div>
        </div>
      )}

      {step === 3 && summary && (
        <div className="card card-pad">
          <div className="mb-4 flex items-center gap-2 text-lg font-semibold"><CheckCircle2 className="text-ok" />Import summary</div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            {[["Rows in file", summary.summary.total], ["Imported", summary.summary.imported], ["Created", summary.summary.created], ["Updated", summary.summary.updated],
              ["Sent for approval", summary.summary.pendingApproval], ["Failed / skipped", summary.summary.failed + summary.summary.skippedInvalid]].map(([k, v]) => (
              <div key={k as string} className="rounded-lg bg-surface-2 p-3"><div className="text-xs text-muted">{k}</div><div className="text-xl font-semibold tabular">{v}</div></div>
            ))}
          </div>
          {summary.results.some((r) => !r.ok) && (
            <div className="mt-4"><h3 className="mb-1 text-sm font-semibold text-bad">Rows that failed during import</h3>
              <ul className="space-y-0.5 text-sm">{summary.results.filter((r) => !r.ok).map((r) => <li key={r.row}>Row {r.row}: {r.error}</li>)}</ul></div>
          )}
          <button className="btn btn-primary mt-5" onClick={() => { setSummary(null); setFile(null); }}>Import another file</button>
        </div>
      )}
    </div>
  );
}
