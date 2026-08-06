import type { NumberingSettings } from "@/lib/system-configuration";

export type DocumentNumberKind = "invoice" | "contract" | "ticket" | "payment";

const LEGACY_PREFIXES: Record<DocumentNumberKind, string[]> = {
  invoice: ["INV-", "I-"],
  contract: ["CTR-", "C-"],
  ticket: ["TKT-", "T-"],
  payment: ["PMT-", "PAY-", "P-"],
};

export type KindConfig = {
  prefixKey: keyof Pick<
    NumberingSettings,
    "invoicePrefix" | "contractPrefix" | "ticketPrefix" | "paymentPrefix"
  >;
  seqKey: keyof Pick<
    NumberingSettings,
    "nextInvoiceSequence" | "nextContractSequence" | "nextTicketSequence" | "nextPaymentSequence"
  >;
};

export const DOCUMENT_NUMBER_KINDS: Record<DocumentNumberKind, KindConfig> = {
  invoice: { prefixKey: "invoicePrefix", seqKey: "nextInvoiceSequence" },
  contract: { prefixKey: "contractPrefix", seqKey: "nextContractSequence" },
  ticket: { prefixKey: "ticketPrefix", seqKey: "nextTicketSequence" },
  payment: { prefixKey: "paymentPrefix", seqKey: "nextPaymentSequence" },
};

export function formatDocumentNumber(prefix: string, sequence: number) {
  return `${prefix}${sequence}`;
}

/**
 * Remap a stored document number to the currently configured prefix for display.
 * Keeps the suffix (including date-style suffixes like 20260806-2560).
 */
export function withConfiguredPrefix(
  stored: string | null | undefined,
  configuredPrefix: string,
  kind: DocumentNumberKind
): string {
  if (!stored) return "";
  if (!configuredPrefix) return stored;
  if (stored.startsWith(configuredPrefix)) return stored;

  const candidates = [configuredPrefix, ...LEGACY_PREFIXES[kind]].filter(
    (value, index, all) => value && all.indexOf(value) === index
  );

  for (const legacy of candidates) {
    if (legacy !== configuredPrefix && stored.startsWith(legacy)) {
      return `${configuredPrefix}${stored.slice(legacy.length)}`;
    }
  }

  const match = /^[A-Za-z][A-Za-z0-9]*-?(?=\d)/.exec(stored);
  if (match) {
    return `${configuredPrefix}${stored.slice(match[0].length)}`;
  }

  return stored;
}

export function suggestContractNumberFromSettings(
  numbering: NumberingSettings,
  existingNumbers: string[]
): string {
  const prefix = numbering.contractPrefix;
  let max = numbering.nextContractSequence - 1;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${escaped}(\\d+)$`, "i");

  for (const raw of existingNumbers) {
    const match = re.exec(raw.trim());
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }

  return formatDocumentNumber(prefix, Math.max(max + 1, numbering.nextContractSequence));
}
