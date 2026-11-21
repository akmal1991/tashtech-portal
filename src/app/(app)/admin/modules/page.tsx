import { requirePage } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { PageHeader, Card } from "@/components/ui";
import { EntityManager } from "@/components/entity-manager";
import { ToggleGroup } from "../settings/settings-forms";
import { BUILTIN_MODULES } from "@/lib/settings-defaults";

export const metadata = { title: "Modules" };

export default async function ModulesAdmin() {
  await requirePage("modules.manage");
  const modules = await getSetting("modules");
  return (
    <>
      <PageHeader title="Modules & sections" subtitle="Activate or deactivate built-in modules and create custom sections (pages or links) that appear in the navigation." />
      <Card title="Built-in modules" className="mb-5">
        <ToggleGroup settingKey="modules" items={BUILTIN_MODULES.map((m) => ({ key: m.key, label: m.label }))} value={modules} />
      </Card>
      <h2 className="mb-3 text-sm font-semibold">Custom modules</h2>
      <EntityManager entity="custom_modules" />
    </>
  );
}
