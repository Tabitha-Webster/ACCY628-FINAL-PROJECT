import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_SYSTEM_CONFIGURATION,
  mergeSystemConfiguration,
  type SystemConfiguration,
} from "@/lib/system-configuration";

export async function loadSystemConfiguration(): Promise<{
  config: SystemConfiguration;
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("system_configuration")
    .select("company, tax, numbering, integrations, demo")
    .eq("id", "default")
    .maybeSingle();

  if (error) {
    return { config: DEFAULT_SYSTEM_CONFIGURATION, error: error.message };
  }

  return {
    config: mergeSystemConfiguration(data as Partial<SystemConfiguration> | null),
    error: null,
  };
}

export async function saveSystemConfiguration(
  config: SystemConfiguration,
  updatedBy: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const payload = {
    id: "default",
    company: config.company,
    tax: config.tax,
    numbering: config.numbering,
    integrations: config.integrations,
    demo: config.demo,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  };

  const { error } = await supabase.from("system_configuration").upsert(payload, { onConflict: "id" });
  return { error: error?.message ?? null };
}
