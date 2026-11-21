"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { api } from "@/lib/client";
import { Modal, useToast } from "@/components/client-ui";

export function ApprovalButtons({ id, own, cancelOnly }: { id: number; own?: boolean; cancelOnly?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<"approved" | "rejected" | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const decide = async (decision: "approved" | "rejected" | "cancelled", c?: string) => {
    setBusy(true);
    try { await api(`/api/approvals/${id}`, { body: { decision, comment: c || null } }); toast("ok", `Request ${decision}`); setMode(null); router.refresh(); }
    catch (e) { toast("error", (e as Error).message); } finally { setBusy(false); }
  };
  if (cancelOnly) return <button className="btn btn-sm" disabled={busy} onClick={() => decide("cancelled")}>Withdraw</button>;
  return (
    <div className="flex gap-1">
      <button className="btn btn-sm border-ok/40 text-ok" disabled={busy} onClick={() => { setComment(""); setMode("approved"); }}><Check size={14} />Approve</button>
      <button className="btn btn-sm border-bad/40 text-bad" disabled={busy} onClick={() => { setComment(""); setMode("rejected"); }}><X size={14} />Reject</button>
      {own && <button className="btn btn-sm" disabled={busy} onClick={() => decide("cancelled")}>Withdraw</button>}
      <Modal open={!!mode} onClose={() => setMode(null)} title={mode === "approved" ? "Approve grade change" : "Reject grade change"} footer={<>
        <button className="btn" onClick={() => setMode(null)}>Cancel</button>
        <button className={mode === "approved" ? "btn btn-primary" : "btn btn-danger"} disabled={busy || (mode === "rejected" && comment.trim().length < 3)} onClick={() => decide(mode!, comment.trim())}>
          {mode === "approved" ? "Approve & apply" : "Reject"}</button>
      </>}>
        <label className="label">Comment {mode === "rejected" ? "(required)" : "(optional)"}</label>
        <textarea className="input" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} autoFocus />
        {mode === "approved" && <p className="mt-2 text-xs text-muted">The mark is changed immediately and recorded in the grade history with your approval.</p>}
      </Modal>
    </div>
  );
}
