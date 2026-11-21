"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { X, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import clsx from "clsx";

// ---------- Modal ----------
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal className={clsx("card flex max-h-[92vh] w-full flex-col rounded-b-none sm:rounded-xl", wide ? "sm:max-w-4xl" : "sm:max-w-lg")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h3 className="font-semibold">{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Toasts ----------
type Toast = { id: number; kind: "ok" | "error" | "info"; text: string };
const ToastCtx = createContext<(kind: Toast["kind"], text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, kind, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === "error" ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className={clsx("card pointer-events-auto flex items-start gap-2 px-4 py-3 text-sm shadow-lg", t.kind === "error" && "border-bad/40", t.kind === "ok" && "border-ok/40")}>
            {t.kind === "ok" ? <CheckCircle2 size={18} className="shrink-0 text-ok" /> : t.kind === "error" ? <AlertTriangle size={18} className="shrink-0 text-bad" /> : <Info size={18} className="shrink-0 text-brand" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- Confirm with typed confirmation ----------
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmText, requireText, danger = true, withReason, busy }: {
  open: boolean; onClose: () => void; onConfirm: (reason: string) => void; title: string; message: React.ReactNode;
  confirmText?: string; requireText?: string; danger?: boolean; withReason?: boolean; busy?: boolean;
}) {
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => { if (open) { setTyped(""); setReason(""); } }, [open]);
  const ok = (!requireText || typed === requireText) && (!withReason || reason.trim().length >= 3);
  return (
    <Modal open={open} onClose={onClose} title={title} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className={clsx("btn", danger ? "btn-danger" : "btn-primary")} disabled={!ok || busy} onClick={() => onConfirm(reason)}>{busy ? "Working…" : confirmText ?? "Confirm"}</button>
    </>}>
      <div className="space-y-3 text-sm">
        <div>{message}</div>
        {withReason && <div><label className="label">Reason (required)</label><textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>}
        {requireText && <div><label className="label">Type <b className="text-fg">{requireText}</b> to confirm</label><input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus /></div>}
      </div>
    </Modal>
  );
}
