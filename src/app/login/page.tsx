import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { LoginForm } from "./login-form";
import { ShieldCheck } from "lucide-react";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSession()) redirect("/");
  const b = await getSetting("branding");
  const { next } = await searchParams;
  const initials = b.shortName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand p-12 text-white lg:flex">
        <div className="absolute -top-24 -right-24 h-80 w-80 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-accent/20" />
        <div className="relative flex items-center gap-3">
          {b.logoDataUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={b.logoDataUrl} alt="" className="h-12 w-12 rounded-lg bg-white/10 object-contain" />
            : <div className="grid h-12 w-12 place-items-center rounded-lg bg-white/15 font-bold">{initials}</div>}
          <div>
            <div className="text-lg font-semibold">{b.name}</div>
            <div className="text-sm text-white/70">{b.tagline}</div>
          </div>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-3xl leading-tight font-semibold">The central academic records system of {b.shortName}.</h1>
          <p className="mt-4 text-white/75">Student records, grades, approvals and a complete audit trail — in one secure place.</p>
        </div>
        <div className="relative flex items-center gap-2 text-sm text-white/70"><ShieldCheck size={16} />Encrypted personal data · Role-based access · Full audit trail</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="text-lg font-semibold text-brand">{b.name}</div>
            <div className="text-sm text-muted">{b.tagline}</div>
          </div>
          <h2 className="text-2xl font-semibold">Sign in</h2>
          <p className="mt-1 mb-6 text-sm text-muted">Use the account issued by the Registrar Office.</p>
          <LoginForm next={next && next.startsWith("/") && !next.startsWith("//") ? next : "/"} />
        </div>
      </div>
    </div>
  );
}
