import { LoginPageClient } from "@/components/LoginPageClient";
import { loadSystemConfiguration } from "@/lib/system-configuration-data";

export default async function LoginPage() {
  const { config } = await loadSystemConfiguration();
  const brandName = config.company.dbaName || config.company.legalName || "ServiceSync MSP";

  return (
    <LoginPageClient brandName={brandName} showDemoLogin={config.demo.loginSelectorEnabled} />
  );
}
