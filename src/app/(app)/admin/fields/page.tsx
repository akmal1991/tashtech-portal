import { requirePage } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { EntityManager } from "@/components/entity-manager";

export const metadata = { title: "Custom Fields" };

export default async function FieldsAdmin() {
  await requirePage("customfields.manage");
  return (
    <>
      <PageHeader title="Custom student fields" subtitle="Add extra fields to student records without changing code. They appear on the student form, profile, Excel import template and exports." />
      <EntityManager entity="custom_fields" />
    </>
  );
}
