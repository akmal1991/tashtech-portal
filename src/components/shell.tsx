"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Bell, Menu, Moon, Sun, LogOut, Search, X, KeyRound, ExternalLink } from "lucide-react";
import { Icon } from "./icons";
import { ToastProvider } from "./client-ui";
import { api, fmtDateTime } from "@/lib/client";

export type NavItem = { href: string; label: string; icon: string; show: boolean; badge?: "pending"; external?: boolean };
export type NavSection = { title: string; items: NavItem[] };
type Branding = { name: string; shortName: string; tagline: string; logoDataUrl: string | null };
type Notif = { id: number; type: string; title: string; body: string | null; link: string | null; is_read: boolean; created_at: string };

export function Shell({ sections, user, branding, notificationsEnabled, children }: {
  sections: NavSection[]; user: { name: string; role: string; faculty: string | null }; branding: Branding; notificationsEnabled: boolean; children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [notif, setNotif] = useState<{ unread: number; pending: number; items: Notif[] }>({ unread: 0, pending: 0, items: [] });
  const [bellOpen, setBellOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  useEffect(() => setOpen(false), [pathname]);

  // Near-real-time notifications: poll every 30 s and when the tab regains focus.
  useEffect(() => {
    let alive = true;
    const load = () => api<typeof notif>("/api/notifications").then((d) => alive && setNotif(d)).catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    window.addEventListener("focus", load);
    return () => { alive = false; clearInterval(t); window.removeEventListener("focus", load); };
  }, [pathname]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("tt-theme", next ? "dark" : "light"); } catch {}
  };
  const logout = async () => { await api("/api/auth/logout", { method: "POST" }).catch(() => {}); router.push("/login"); router.refresh(); };
  const markAll = async () => { await api("/api/notifications", { body: { all: true } }); setNotif((n) => ({ ...n, unread: 0, items: n.items.map((i) => ({ ...i, is_read: true })) })); };
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const initials = branding.shortName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  const sidebar = (
    <nav className="flex h-full flex-col">
      <Link href="/" className="flex items-center gap-3 px-4 py-4">
        {branding.logoDataUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={branding.logoDataUrl} alt="" className="h-10 w-10 rounded-lg object-contain" />
          : <div className="grid h-10 w-10 place-items-center rounded-lg bg-white/15 text-sm font-bold text-white">{initials}</div>}
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold text-white">{branding.shortName}</div>
          <div className="truncate text-[11px] text-white/65">{branding.tagline}</div>
        </div>
      </Link>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-6 pt-2">
        {sections.map((sec) => (
          <div key={sec.title}>
            <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">{sec.title}</div>
            <ul className="space-y-0.5">
              {sec.items.map((it) => (
                <li key={it.href}>
                  <Link href={it.href} target={it.external ? "_blank" : undefined}
                    className={clsx("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition",
                      isActive(it.href) && !it.external ? "bg-white text-brand shadow-sm" : "text-white/80 hover:bg-white/10 hover:text-white")}>
                    <Icon name={it.icon} size={17} />
                    <span className="flex-1 truncate">{it.label}</span>
                    {it.external && <ExternalLink size={12} className="opacity-60" />}
                    {it.badge === "pending" && notif.pending > 0 && <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">{notif.pending}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 px-4 py-3 text-[11px] text-white/50">{branding.name}</div>
    </nav>
  );

  return (
    <ToastProvider>
      <div className="flex min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-brand lg:block">{sidebar}</aside>
        {open && (
          <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
            <div className="absolute inset-0 bg-black/50" />
            <aside className="absolute inset-y-0 left-0 w-72 bg-brand shadow-xl" onClick={(e) => e.stopPropagation()}>
              <button className="absolute top-4 right-3 text-white/80" onClick={() => setOpen(false)} aria-label="Close menu"><X size={20} /></button>
              {sidebar}
            </aside>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-surface/90 px-3 backdrop-blur sm:px-5">
            <button className="btn btn-ghost btn-sm lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
            <form action="/students" className="relative max-w-md flex-1">
              <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
              <input name="q" placeholder="Search students by name, ID, passport, JSHSHIR…" className="input h-9 pl-9" />
            </form>
            <div className="ml-auto flex items-center gap-1">
              <button className="btn btn-ghost btn-sm" onClick={toggleTheme} aria-label="Toggle dark mode" title="Toggle dark mode">{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
              {notificationsEnabled && (
                <div className="relative" ref={bellRef}>
                  <button className="btn btn-ghost btn-sm relative" onClick={() => setBellOpen((v) => !v)} aria-label="Notifications">
                    <Bell size={18} />
                    {notif.unread > 0 && <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] font-bold text-white">{notif.unread > 99 ? "99+" : notif.unread}</span>}
                  </button>
                  {bellOpen && (
                    <div className="card absolute right-0 mt-2 w-[min(92vw,360px)] overflow-hidden shadow-xl">
                      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                        <span className="text-sm font-semibold">Notifications</span>
                        {notif.unread > 0 && <button className="text-xs text-brand hover:underline" onClick={markAll}>Mark all read</button>}
                      </div>
                      <ul className="max-h-96 overflow-y-auto">
                        {notif.items.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">No notifications</li>}
                        {notif.items.map((n) => (
                          <li key={n.id} className={clsx("border-b border-line last:border-0", !n.is_read && "bg-brand/5")}>
                            <Link href={n.link ?? "/notifications"} onClick={() => { setBellOpen(false); if (!n.is_read) api("/api/notifications", { body: { ids: [n.id] } }).catch(() => {}); }} className="block px-4 py-2.5 hover:bg-surface-2">
                              <div className="flex items-center gap-2 text-[13px] font-medium">{!n.is_read && <span className="h-2 w-2 rounded-full bg-brand" />}{n.title}</div>
                              {n.body && <div className="mt-0.5 line-clamp-2 text-xs text-muted">{n.body}</div>}
                              <div className="mt-1 text-[11px] text-muted">{fmtDateTime(n.created_at)}</div>
                            </Link>
                          </li>
                        ))}
                      </ul>
                      <Link href="/notifications" onClick={() => setBellOpen(false)} className="block border-t border-line px-4 py-2 text-center text-xs font-medium text-brand hover:bg-surface-2">View all</Link>
                    </div>
                  )}
                </div>
              )}
              <div className="relative">
                <button className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-surface-2" onClick={() => setUserOpen((v) => !v)}>
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-brand text-xs font-semibold text-white">{user.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}</div>
                  <div className="hidden text-left leading-tight sm:block">
                    <div className="text-[13px] font-medium">{user.name}</div>
                    <div className="text-[11px] text-muted">{user.role}{user.faculty ? ` · ${user.faculty.replace("Faculty of ", "")}` : ""}</div>
                  </div>
                </button>
                {userOpen && (
                  <div className="card absolute right-0 mt-2 w-52 overflow-hidden py-1 shadow-xl" onMouseLeave={() => setUserOpen(false)}>
                    <Link href="/profile" className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-2" onClick={() => setUserOpen(false)}><KeyRound size={15} />Change password</Link>
                    <button onClick={logout} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-bad hover:bg-surface-2"><LogOut size={15} />Sign out</button>
                  </div>
                )}
              </div>
            </div>
          </header>
          <main className="mx-auto w-full max-w-[1500px] flex-1 px-3 py-5 sm:px-6 sm:py-6">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
