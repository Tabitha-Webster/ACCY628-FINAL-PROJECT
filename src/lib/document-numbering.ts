import {
  DEFAULT_SYSTEM_CONFIGURATION,
  mergeSystemConfiguration,
  type NumberingSettings,
  type SystemConfiguration,
} from "@/lib/system-configuration";
import { createClient } from "@/lib/supabase/server";
import {
  DOCUMENT_NUMBER_KINDS,
  formatDocumentNumber,
  suggestContractNumberFromSettings,
  withConfiguredPrefix,
  type DocumentNumberKind,
} from "@/lib/document-numbering-shared";

export type { DocumentNumberKind } from "@/lib/document-numbering-shared";
export {
  DOCUMENT_NUMBER_KINDS,
  formatDocumentNumber,
  suggestContractNumberFromSettings,
  withConfiguredPrefix,
} from "@/lib/document-numbering-shared";

export async function loadNumberingSettings(): Promise<{
  numbering: NumberingSettings;
  config: SystemConfiguration;
  error: string | null;
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("system_configuration")
      .select("company, tax, numbering, integrations, demo")
      .eq("id", "default")
      .maybeSingle();

    if (error) {
      return {
        numbering: DEFAULT_SYSTEM_CONFIGURATION.numbering,
        config: DEFAULT_SYSTEM_CONFIGURATION,
        error: error.message,
      };
    }

    const config = mergeSystemConfiguration(data as Partial<SystemConfiguration> | null);
    return { numbering: config.numbering, config, error: null };
  } catch (err) {
    return {
      numbering: DEFAULT_SYSTEM_CONFIGURATION.numbering,
      config: DEFAULT_SYSTEM_CONFIGURATION,
      error: err instanceof Error ? err.message : "Could not load numbering settings.",
    };
  }
}

/**
 * Allocate the next document number from Admin → Configurations → Numbering.
 */
export async function allocateNextDocumentNumber(
  kind: DocumentNumberKind
): Promise<{ number: string; error: string | null }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("allocate_document_number", {
      p_kind: kind,
    });

    if (error) {
      const { numbering } = await loadNumberingSettings();
      const meta = DOCUMENT_NUMBER_KINDS[kind];
      const prefix = String(numbering[meta.prefixKey] ?? "");
      const sequence = Math.max(1, Math.floor(Number(numbering[meta.seqKey]) || 1001));
      return {
        number: formatDocumentNumber(prefix, sequence),
        error: error.message,
      };
    }

    if (typeof data !== "string" || !data) {
      return { number: "", error: "Document number was not returned." };
    }

    return { number: data, error: null };
  } catch (err) {
    return {
      number: "",
      error: err instanceof Error ? err.message : "Could not allocate document number.",
    };
  }
}

export async function bumpSequenceAfterManualNumber(
  kind: DocumentNumberKind,
  usedNumber: string
): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("bump_document_sequence", {
      p_kind: kind,
      p_used_number: usedNumber,
    });
    return error?.message ?? null;
  } catch (err) {
    return err instanceof Error ? err.message : "Could not bump document sequence.";
  }
}

export async function rewriteDocumentPrefixes(
  previous: NumberingSettings,
  next: NumberingSettings
): Promise<{ rewritten: Partial<Record<DocumentNumberKind, number>>; errors: string[] }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("rewrite_document_number_prefixes", {
      p_previous: previous,
      p_next: next,
    });

    if (error) {
      return { rewritten: {}, errors: [error.message] };
    }

    const raw = (data ?? {}) as Record<string, unknown>;
    const rewritten: Partial<Record<DocumentNumberKind, number>> = {};
    for (const kind of Object.keys(DOCUMENT_NUMBER_KINDS) as DocumentNumberKind[]) {
      const value = raw[kind];
      if (typeof value === "number") rewritten[kind] = value;
    }
    return { rewritten, errors: [] };
  } catch (err) {
    return {
      rewritten: {},
      errors: [err instanceof Error ? err.message : "Could not rewrite document prefixes."],
    };
  }
}
