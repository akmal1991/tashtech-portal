import { requirePage } from "@/lib/auth";
import { sql } from "@/lib/db";
import { PageHeader, Tabs } from "@/components/ui";
import { EntityManager } from "@/components/entity-manager";
import { SchemeEditor } from "./scheme-editor";

export const metadata = { title: "Grading Policy" };

export default async function GradingPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requirePage("grading.manage");
  const { tab } = await searchParams;
  const schemes = await sql`select g.*, (select count(*)::int from courses c where c.grading_scheme_id = g.id) as courses,
      coalesce((select json_agg(json_build_object('assessment_type_id', sc.assessment_type_id, 'weight', sc.weight, 'max_score', sc.max_score, 'min_score', sc.min_score)) from scheme_components sc where sc.scheme_id = g.id), '[]') as components
    from grading_schemes g order by g.is_default desc, g.name`;
  const types = await sql`select id, code, name, replaces_type_id, is_active from assessment_types order by sort_order, id`;
  return (
    <>
      <PageHeader title="Grading policy" subtitle="Assessment weights, maximum and minimum scores, pass marks and letter scales. Totals are calculated automatically from these rules." />
      <Tabs active={tab === "types" ? "types" : "schemes"} tabs={[{ key: "schemes", label: "Grading schemes", href: "/admin/grading" }, { key: "types", label: "Assessment types", href: "/admin/grading?tab=types" }]} />
      {tab === "types" ? <EntityManager entity="assessment_types" /> : <SchemeEditor schemes={JSON.parse(JSON.stringify(schemes))} types={[...types] as never} />}
    </>
  );
}
