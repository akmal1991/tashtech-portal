import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { sql } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { renderMarkdown } from "@/lib/markdown";

export default async function CustomModule({ params }: { params: Promise<{ slug: string }> }) {
  const s = await requirePage();
  const { slug } = await params;
  const [m] = await sql`select * from custom_modules where slug = ${slug} and is_active`;
  if (!m || (m.required_permission && !s.permissions.has(m.required_permission))) notFound();
  return (
    <>
      <PageHeader title={m.title} />
      <article className="card card-pad prose-md max-w-4xl" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content ?? "") }} />
    </>
  );
}
