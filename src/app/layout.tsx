import type { Metadata } from "next";
import "./globals.css";
import { getSetting } from "@/lib/settings";

export async function generateMetadata(): Promise<Metadata> {
  const b = await getSetting("branding").catch(() => null);
  return { title: { default: b?.shortName ?? "Tashkent Tech", template: `%s · ${b?.shortName ?? "Tashkent Tech"}` }, description: b?.tagline };
}

const themeScript = `try{var t=localStorage.getItem('tt-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const b = await getSetting("branding").catch(() => null);
  const vars = b ? `:root{--brand:${b.primaryColor};--accent:${b.accentColor}}` : "";
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <style dangerouslySetInnerHTML={{ __html: vars }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
