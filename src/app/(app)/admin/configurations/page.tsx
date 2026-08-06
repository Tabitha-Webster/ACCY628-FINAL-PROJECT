import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { PageHeader } from "@/components/ui";
import { ConfigurationsManager } from "@/components/ConfigurationsManager";
import { loadSystemConfiguration } from "@/lib/system-configuration-data";

export default async function AdminConfigurationsPage() {
  await requireAdmin();
  const { config } = await loadSystemConfiguration();

  return (
    <div>
      <PageHeader
        title="Configurations"
        description="Company settings, tax defaults, numbering, integrations, and demo toggles for the platform."
        actions={
          <Link href="/admin" className="btn btn-sm btn-outline">
            Back to Home
          </Link>
        }
      />

      <ConfigurationsManager initial={config} />
    </div>
  );
}
