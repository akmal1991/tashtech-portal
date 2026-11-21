"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useToast } from "./client-ui";

type Opt = { id: number; name: string };
type Group = Opt & { program_id: number };
type Field = { field_key: string; label: string; field_type: string; options: string | null; is_required: boolean };

export function StudentForm({ initial, programs, groups, customFields, canSensitive, studentId }: {
  initial: Record<string, unknown>; programs: Opt[]; groups: Group[]; customFields: Field[]; canSensitive: boolean; studentId?: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState<Record<string, unknown>>(initial);
  const [custom, setCustom] = useState<Record<string, unknown>>((initial.custom_data as Record<string, unknown>) ?? {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  const progGroups = useMemo(() => groups.filter((g) => String(g.program_id) === String(v.program_id)), [groups, v.program_id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const body: Record<string, unknown> = { ...v, custom_data: custom };
    if (!canSensitive) { delete body.passport; delete body.jshshir; }
    else {
      if (studentId && body.passport === "") delete body.passport; // blank = keep existing
      if (studentId && body.jshshir === "") delete body.jshshir;
    }
    try {
      const r = studentId
        ? await api(`/api/students/${studentId}`, { method: "PUT", body })
        : await api<{ id: number }>("/api/students", { body });
      toast("ok", studentId ? "Student updated" : "Student registered");
      router.push(`/students/${studentId ?? (r as { id: number }).id}`);
      router.refresh();
    } catch (err) { setError((err as Error).message); setBusy(false); }
  }

  const F = ({ k, label, type = "text", required, ...rest }: { k: string; label: string; type?: string; required?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) => (
    <div><label className="label">{label}{required && " *"}</label><input className="input" type={type} value={(v[k] as string) ?? ""} onChange={set(k)} required={required} {...rest} /></div>
  );

  return (
    <form onSubmit={submit} className="space-y-5">
      <section className="card card-pad">
        <h2 className="mb-4 text-sm font-semibold">Identity</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {F({ k: "student_number", label: "Student ID / Registration No.", required: true })}
          {F({ k: "last_name", label: "Last name", required: true })}
          {F({ k: "first_name", label: "First name", required: true })}
          {F({ k: "middle_name", label: "Middle name (patronymic)" })}
          {F({ k: "date_of_birth", label: "Date of birth", type: "date" })}
          <div><label className="label">Gender</label><select className="input" value={(v.gender as string) ?? ""} onChange={set("gender")}><option value="">—</option><option>Male</option><option>Female</option></select></div>
          {canSensitive ? <>
            {F({ k: "passport", label: studentId ? "Passport (leave blank to keep)" : "Passport series & number", placeholder: "AB1234567", autoComplete: "off" })}
            {F({ k: "jshshir", label: studentId ? "JSHSHIR (leave blank to keep)" : "JSHSHIR (14 digits)", placeholder: "12345678901234", inputMode: "numeric", autoComplete: "off" })}
          </> : <p className="text-xs text-muted sm:col-span-2">Passport and JSHSHIR can only be entered by users with sensitive-data access.</p>}
        </div>
      </section>
      <section className="card card-pad">
        <h2 className="mb-4 text-sm font-semibold">Academic</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div><label className="label">Study program *</label>
            <select className="input" required value={(v.program_id as string) ?? ""} onChange={(e) => setV((x) => ({ ...x, program_id: e.target.value, group_id: "" }))}>
              <option value="">Select…</option>{programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></div>
          <div><label className="label">Group</label>
            <select className="input" value={(v.group_id as string) ?? ""} onChange={set("group_id")}>
              <option value="">—</option>{progGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select></div>
          <div><label className="label">Study mode</label><select className="input" value={(v.study_mode as string) ?? "Full-time"} onChange={set("study_mode")}><option>Full-time</option><option>Part-time</option></select></div>
          {F({ k: "current_year", label: "Current academic year (1–8)", type: "number", min: 1, max: 8 })}
          {F({ k: "current_semester", label: "Current semester (1–16)", type: "number", min: 1, max: 16 })}
          <div><label className="label">Enrollment status</label><select className="input" value={(v.status as string) ?? "Active"} onChange={set("status")}>{["Active", "Graduated", "Suspended", "Withdrawn"].map((x) => <option key={x}>{x}</option>)}</select></div>
          {F({ k: "enrollment_date", label: "Enrollment date", type: "date" })}
        </div>
      </section>
      <section className="card card-pad">
        <h2 className="mb-4 text-sm font-semibold">Contact & notes</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {F({ k: "phone", label: "Phone" })}
          {F({ k: "email", label: "Email", type: "email" })}
          {F({ k: "address", label: "Address" })}
          <div className="sm:col-span-2 lg:col-span-3"><label className="label">Additional notes</label><textarea className="input" rows={3} value={(v.notes as string) ?? ""} onChange={set("notes")} /></div>
        </div>
      </section>
      {customFields.length > 0 && (
        <section className="card card-pad">
          <h2 className="mb-4 text-sm font-semibold">Additional fields</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {customFields.map((f) => (
              <div key={f.field_key}>
                <label className="label">{f.label}{f.is_required && " *"}</label>
                {f.field_type === "select" ? (
                  <select className="input" required={f.is_required} value={(custom[f.field_key] as string) ?? ""} onChange={(e) => setCustom((c) => ({ ...c, [f.field_key]: e.target.value }))}>
                    <option value="">—</option>{(f.options ?? "").split(",").map((o) => o.trim()).filter(Boolean).map((o) => <option key={o}>{o}</option>)}
                  </select>
                ) : f.field_type === "checkbox" ? (
                  <label className="flex h-[38px] items-center gap-2 text-sm"><input type="checkbox" checked={!!custom[f.field_key]} onChange={(e) => setCustom((c) => ({ ...c, [f.field_key]: e.target.checked }))} />Yes</label>
                ) : (
                  <input className="input" required={f.is_required} type={f.field_type === "number" ? "number" : f.field_type === "date" ? "date" : "text"}
                    value={(custom[f.field_key] as string) ?? ""} onChange={(e) => setCustom((c) => ({ ...c, [f.field_key]: e.target.value }))} />
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      {error && <div role="alert" className="rounded-lg border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">{error}</div>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn" onClick={() => router.back()}>Cancel</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : studentId ? "Save changes" : "Register student"}</button>
      </div>
    </form>
  );
}
