"use client";
import { useRouter, usePathname } from "next/navigation";

/** GET form that navigates on submit and auto-submits when a select changes. Empty fields are dropped from the URL. */
export function AutoForm({ children, className, keep = [] }: { children: React.ReactNode; className?: string; keep?: [string, string][] }) {
  const router = useRouter();
  const pathname = usePathname();
  const go = (form: HTMLFormElement) => {
    const p = new URLSearchParams();
    for (const [k, v] of new FormData(form).entries()) if (typeof v === "string" && v.trim()) p.set(k, v.trim());
    for (const [k, v] of keep) if (v) p.set(k, v);
    router.push(`${pathname}${p.toString() ? `?${p}` : ""}`);
  };
  return (
    <form className={className} onSubmit={(e) => { e.preventDefault(); go(e.currentTarget); }}
      onChange={(e) => { const t = e.target as unknown as HTMLInputElement; if (t.tagName === "SELECT" || t.type === "checkbox" || t.type === "date") go(e.currentTarget); }}>
      {children}
    </form>
  );
}
