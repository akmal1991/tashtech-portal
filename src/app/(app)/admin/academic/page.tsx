import { requirePage } from "@/lib/auth";
import { PageHeader, Tabs } from "@/components/ui";
import { EntityManager } from "@/components/entity-manager";
import type { EntityKey } from "@/lib/entities";

export const metadata = { title: "Academic Structure" };
const TABS: { key: EntityKey; label: string }[] = [
  { key: "faculties", label: "Faculties" }, { key: "departments", label: "Departments" }, { key: "programs", label: "Programs" },
  { key: "groups", label: "Groups" }, { key: "academic_years", label: "Academic years" }, { key: "semesters", label: "Semesters & locking" }, { key: "subjects", label: "Subjects" },
];

export default async function AcademicAdmin({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requirePage("academic.manage");
  const { tab } = await searchParams;
  const active = TABS.find((t) => t.key === tab)?.key ?? "faculties";
  return (
    <>
      <PageHeader title="Academic structure" subtitle="Faculties, departments, programs, groups, academic years, semesters and subjects. Lock a semester to close grade entry." />
      <Tabs active={active} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: `/admin/academic?tab=${t.key}` }))} />
      <EntityManager key={active} entity={active} />
    </>
  );
}
