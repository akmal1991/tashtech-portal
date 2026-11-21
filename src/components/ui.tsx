import Link from "next/link";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";

export function PageHeader({ title, subtitle, actions, back }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-5">
      {back && <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-fg"><ChevronLeft size={14} />{back.label}</Link>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({ title, actions, children, className, pad = true }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={clsx("card", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {actions}
        </div>
      )}
      <div className={pad ? "card-pad" : ""}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "ok" | "bad" | "warn" }) {
  return (
    <div className="card card-pad">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={clsx("kpi-value mt-1 tabular", tone === "ok" && "text-ok", tone === "bad" && "text-bad", tone === "warn" && "text-warn")}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

const statusTone: Record<string, string> = {
  Active: "badge-green", Graduated: "badge-blue", Suspended: "badge-amber", Withdrawn: "badge-red",
  passed: "badge-green", failed: "badge-red", incomplete: "badge-gray",
  pending: "badge-amber", approved: "badge-green", rejected: "badge-red", cancelled: "badge-gray",
  Created: "badge-green", Updated: "badge-blue", Deleted: "badge-red",
};
export function Badge({ children, tone }: { children: React.ReactNode; tone?: string }) {
  const key = typeof children === "string" ? children : "";
  return <span className={clsx("badge", tone ?? statusTone[key] ?? "badge-gray")}>{children}</span>;
}

export function ResultBadge({ status, retake }: { status: string; retake?: boolean }) {
  if (status === "failed" && retake) return <span className="badge badge-amber">Retake required</span>;
  return <Badge tone={statusTone[status]}>{status === "incomplete" ? "In progress" : status[0].toUpperCase() + status.slice(1)}</Badge>;
}

export function Empty({ children = "Nothing to show" }: { children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-muted">
      <Inbox size={28} className="opacity-50" />
      {children}
    </div>
  );
}

export function Pagination({ page, pages, total, href }: { page: number; pages: number; total: number; href: (p: number) => string }) {
  if (pages <= 1) return <div className="px-4 py-3 text-xs text-muted">{total} record(s)</div>;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-muted">
      <span>{total} record(s) · page {page} of {pages}</span>
      <div className="flex items-center gap-1">
        <Link aria-disabled={page <= 1} className={clsx("btn btn-sm", page <= 1 && "pointer-events-none opacity-40")} href={href(page - 1)}><ChevronLeft size={14} />Prev</Link>
        <Link aria-disabled={page >= pages} className={clsx("btn btn-sm", page >= pages && "pointer-events-none opacity-40")} href={href(page + 1)}>Next<ChevronRight size={14} /></Link>
      </div>
    </div>
  );
}

export function Tabs({ tabs, active }: { tabs: { key: string; label: string; href: string; count?: number }[]; active: string }) {
  return (
    <div className="scroll-x mb-4 flex gap-1 overflow-y-hidden border-b border-line">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} className={clsx("tab", t.key === active && "tab-active")}>
          {t.label}{t.count != null && <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 text-xs">{t.count}</span>}
        </Link>
      ))}
    </div>
  );
}

export function Select({ name, value, options, placeholder, className }: { name: string; value?: string; options: { value: string | number; label: string }[]; placeholder?: string; className?: string }) {
  return (
    <select name={name} defaultValue={value ?? ""} className={clsx("input", className)}>
      <option value="">{placeholder ?? "All"}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
