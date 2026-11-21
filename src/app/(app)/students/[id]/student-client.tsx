"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Trash2, RotateCcw } from "lucide-react";
import { api } from "@/lib/client";
import { ConfirmDialog, useToast } from "@/components/client-ui";

export function SensitiveReveal({ studentId, field, masked }: { studentId: number; field: "passport" | "jshshir"; masked: string }) {
  const [value, setValue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const toggle = async () => {
    if (value) return setValue(null);
    setBusy(true);
    try {
      const d = await api<{ passport: string | null; jshshir: string | null }>(`/api/students/${studentId}/sensitive`);
      setValue(d[field] ?? "—");
    } catch (e) { toast("error", (e as Error).message); } finally { setBusy(false); }
  };
  return (
    <span className="inline-flex items-center gap-2 font-mono">
      {value ?? masked}
      {masked !== "—" && (
        <button type="button" onClick={toggle} disabled={busy} className="text-muted hover:text-fg" title={value ? "Hide" : "Reveal (access is logged)"} aria-label={value ? "Hide" : "Reveal"}>
          {value ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      )}
    </span>
  );
}

export function StudentActions({ id, studentNumber, archived }: { id: number; studentNumber: string; archived: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();
  if (archived) {
    return (
      <button className="btn" disabled={busy} onClick={async () => {
        setBusy(true);
        try { await api(`/api/students/${id}/restore`, { method: "POST" }); toast("ok", "Student restored"); router.refresh(); }
        catch (e) { toast("error", (e as Error).message); } finally { setBusy(false); }
      }}><RotateCcw size={16} />Restore</button>
    );
  }
  return (
    <>
      <button className="btn text-bad" onClick={() => setOpen(true)}><Trash2 size={16} />Delete</button>
      <ConfirmDialog open={open} onClose={() => setOpen(false)} busy={busy} title="Archive student record" confirmText="Archive student"
        requireText={studentNumber} withReason
        message={<>The student is moved to the archive. Academic history and the audit trail are preserved and the record can be restored by an administrator.</>}
        onConfirm={async (reason) => {
          setBusy(true);
          try { await api(`/api/students/${id}`, { method: "DELETE", body: { confirm: studentNumber, reason } }); toast("ok", "Student archived"); router.push("/students"); router.refresh(); }
          catch (e) { toast("error", (e as Error).message); setBusy(false); }
        }} />
    </>
  );
}
