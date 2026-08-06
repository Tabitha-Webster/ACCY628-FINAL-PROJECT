"use client";

import { useState } from "react";
import { Download, Printer } from "lucide-react";
import { buildContractPdfBlob, downloadPdfBlob, printPdfBlob } from "@/lib/contracts/build-contract-pdf";
import {
  packetSignaturesForPdf,
  type ContractPdfInput,
  type ContractSignaturePacket,
} from "@/lib/contracts/signature-packets";

type Props = {
  contract: ContractPdfInput["contract"] & { contract_number: string };
  customerName: string;
  managerName?: string | null;
  packet?: ContractSignaturePacket | null;
  className?: string;
};

/**
 * Download / print a customer-facing contract PDF (with signatures when available).
 */
export function CustomerContractPdfActions({
  contract,
  customerName,
  managerName = null,
  packet = null,
  className = "",
}: Props) {
  const [busy, setBusy] = useState<"download" | "print" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buildBlob() {
    return buildContractPdfBlob({
      contract,
      customerName,
      managerName,
      signatures: packetSignaturesForPdf(packet),
    });
  }

  async function onDownload() {
    setBusy("download");
    setError(null);
    try {
      const blob = await buildBlob();
      downloadPdfBlob(blob, `${contract.contract_number}-agreement.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the PDF.");
    } finally {
      setBusy(null);
    }
  }

  async function onPrint() {
    setBusy("print");
    setError(null);
    try {
      const blob = await buildBlob();
      printPdfBlob(blob);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not print the PDF.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-outline btn-xs gap-1"
          disabled={busy != null}
          onClick={onDownload}
        >
          <Download className="h-3.5 w-3.5" />
          {busy === "download" ? "Preparing…" : "Download PDF"}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-xs gap-1 border border-base-300"
          disabled={busy != null}
          onClick={onPrint}
        >
          <Printer className="h-3.5 w-3.5" />
          {busy === "print" ? "Preparing…" : "Print"}
        </button>
      </div>
      {error ? (
        <p className="mt-1 text-xs text-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
