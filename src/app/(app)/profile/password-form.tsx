"use client";
import { useState } from "react";
import { api } from "@/lib/client";
import { useToast } from "@/components/client-ui";

export function PasswordForm() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const fd = new FormData(form);
      setErr(null);
      if (fd.get("next") !== fd.get("confirm")) return setErr("New passwords do not match");
      setBusy(true);
      try { await api("/api/auth/password", { body: { current: fd.get("current"), next: fd.get("next") } }); toast("ok", "Password changed. Other sessions were signed out."); form.reset(); }
      catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
    }}>
      <div><label className="label">Current password</label><input name="current" type="password" required autoComplete="current-password" className="input" /></div>
      <div><label className="label">New password</label><input name="next" type="password" required autoComplete="new-password" className="input" /></div>
      <div><label className="label">Confirm new password</label><input name="confirm" type="password" required autoComplete="new-password" className="input" /></div>
      <p className="text-xs text-muted">At least 10 characters with upper- and lower-case letters, a digit and a symbol.</p>
      {err && <p className="text-sm text-bad">{err}</p>}
      <button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Change password"}</button>
    </form>
  );
}
