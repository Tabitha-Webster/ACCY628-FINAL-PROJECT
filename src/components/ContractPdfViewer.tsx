"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { packetSignaturesForPdf, pdfContractFromRow } from "@/lib/contracts";
import { buildContractPdfBlob, downloadPdfBlob } from "@/lib/contracts/build-contract-pdf";
import type { ContractPdfInput, ContractSignaturePacket } from "@/lib/contracts/signature-packets";

type Props = {
  contract: ContractPdfInput["contract"] & { id: string; customer_id: string };
  customerName: string;
  managerName: string | null;
  technicianName?: string | null;
  packet: ContractSignaturePacket | null;
  backHref?: string;
  editHref?: string | null;
};

export function ContractPdfViewer({
  contract,
  customerName,
  managerName,
  technicianName = null,
  packet,
  backHref = "/contracts/view-edit",
  editHref = null,
}: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [building, setBuilding] = useState(true);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    setBuilding(true);
    setError(null);
    (async () => {
      const blob = await buildContractPdfBlob({
        contract: pdfContractFromRow(contract),
        customerName,
        managerName,
        technicianName,
        signatures: packetSignaturesForPdf(packet),
      });
      if (cancelled) return;
      const url = URL.createObjectURL(blob);
      revoked = url;
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setBuilding(false);
    })().catch((err: unknown) => {
      if (!cancelled) {
        setBuilding(false);
        setError(err instanceof Error ? err.message : "Could not build the contract PDF.");
      }
    });
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [contract, customerName, managerName, technicianName, packet, refreshKey]);

  async function onDownload() {
    const blob = await buildContractPdfBlob({
      contract: pdfContractFromRow(contract),
      customerName,
      managerName,
      technicianName,
      signatures: packetSignaturesForPdf(packet),
    });
    downloadPdfBlob(blob, `${contract.contract_number}-agreement.pdf`);
  }

  function onPrint() {
    if (!previewUrl) return;
    const win = window.open(previewUrl);
    win?.addEventListener("load", () => win.print());
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {contract.contract_number} · {contract.name}
          </h1>
          <p className="mt-1 text-sm opacity-70">{customerName}</p>
          <p className="mt-1 text-xs opacity-60">
            PDF is generated from the current contract record (including recent edits).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={backHref} className="btn btn-ghost btn-sm">
            ← Back
          </Link>
          {editHref ? (
            <Link href={editHref} className="btn btn-outline btn-sm">
              Edit
            </Link>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setPreviewUrl(null);
              setRefreshKey((key) => key + 1);
            }}
            disabled={building}
          >
            Regenerate PDF
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={onDownload} disabled={!previewUrl}>
            Download PDF
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onPrint} disabled={!previewUrl}>
            Print
          </button>
        </div>
      </div>

      {error ? <div className="alert alert-error text-sm">{error}</div> : null}

      {previewUrl ? (
        <iframe
          title={`${contract.contract_number} PDF`}
          src={previewUrl}
          className="h-[min(80vh,52rem)] w-full rounded-box border border-base-300 bg-white"
        />
      ) : !error ? (
        <p className="text-sm opacity-60">Building PDF…</p>
      ) : null}
    </div>
  );
}
