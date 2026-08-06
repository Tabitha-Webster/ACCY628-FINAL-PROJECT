"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SignaturePad } from "@/components/SignaturePad";
import { StatusBadge } from "@/components/ui";
import { buildContractPdfBlob } from "@/lib/contracts/build-contract-pdf";
import {
  SIGNATURE_PACKET_STATUS_LABELS,
  packetSignaturesForPdf,
  type ContractPdfInput,
  type ContractSignaturePacket,
} from "@/lib/contracts/signature-packets";

type Props = {
  contract: ContractPdfInput["contract"] & { id: string; customer_id: string };
  customerName: string;
  managerName: string | null;
  profileId: string;
  profileName: string;
  packet: ContractSignaturePacket;
};

export function CustomerContractSignaturePanel({
  contract,
  customerName,
  managerName,
  profileId,
  profileName,
  packet: initialPacket,
}: Props) {
  const router = useRouter();
  const [packet, setPacket] = useState(initialPacket);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const pdfInput = useMemo<ContractPdfInput>(
    () => ({
      contract,
      customerName,
      managerName,
      signatures: packetSignaturesForPdf(packet),
    }),
    [contract, customerName, managerName, packet]
  );

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    (async () => {
      const blob = await buildContractPdfBlob(pdfInput);
      if (cancelled) return;
      const url = URL.createObjectURL(blob);
      revoked = url;
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    })().catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : "Could not build PDF.");
    });
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [pdfInput]);

  async function signAndAccept() {
    if (packet.status !== "awaiting_customer") return;
    if (!signatureData) {
      setError("Draw your signature before accepting.");
      return;
    }
    if (!ack) {
      setError("Confirm the electronic signature acknowledgment.");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();
    const signedAt = new Date().toISOString();

    const { data, error: updateError } = await supabase
      .from("contract_signature_packets")
      .update({
        customer_signed_by: profileId,
        customer_signed_at: signedAt,
        customer_signature_data: signatureData,
        customer_signer_name: profileName,
        updated_at: signedAt,
      })
      .eq("id", packet.id)
      .eq("status", "awaiting_customer")
      .select("*")
      .single();

    if (updateError || !data) {
      setBusy(false);
      setError(updateError?.message || "Could not save signature.");
      return;
    }

    const nextPacket = data as ContractSignaturePacket;
    setPacket(nextPacket);

    try {
      const blob = await buildContractPdfBlob({
        contract,
        customerName,
        managerName,
        signatures: packetSignaturesForPdf(nextPacket),
      });
      const path = `${contract.id}/signature-packets/${nextPacket.id}-executed.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("contract-documents")
        .upload(path, blob, { contentType: "application/pdf", upsert: true });
      if (uploadError) throw new Error(uploadError.message);

      const { data: finalized, error: finalizeError } = await supabase.rpc(
        "finalize_contract_signature_packet",
        {
          p_packet_id: nextPacket.id,
          p_storage_path: path,
          p_document_name: `${contract.contract_number}-fully-executed.pdf`,
          p_file_size: blob.size,
        }
      );
      if (finalizeError) throw new Error(finalizeError.message);
      if (finalized) setPacket(finalized as ContractSignaturePacket);
      setMessage("Contract signed and accepted. The agreement is now Active.");
      setSignatureData(null);
      setAck(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signature saved, but finalization failed.");
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!rejectReason.trim()) {
      setError("Enter a short rejection note.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("reject_contract_signature_packet", {
      p_packet_id: packet.id,
      p_reason: rejectReason.trim(),
    });

    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    setPacket(data as ContractSignaturePacket);
    setMessage("You rejected this agreement. Your account manager can revise and resend it.");
    router.refresh();
  }

  const awaiting = packet.status === "awaiting_customer";
  const executed = packet.status === "fully_executed";

  return (
    <div className="mt-4 space-y-3 rounded-box border border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Contract signature</p>
          <StatusBadge status={packet.status} label={SIGNATURE_PACKET_STATUS_LABELS[packet.status]} />
        </div>
      </div>

      {error ? <div className="alert alert-error text-sm">{error}</div> : null}
      {message ? <div className="alert alert-success text-sm">{message}</div> : null}

      {previewUrl ? (
        <iframe title="Agreement PDF" src={previewUrl} className="h-72 w-full rounded-box border border-base-300 bg-white" />
      ) : null}

      {awaiting ? (
        <>
          <p className="text-sm opacity-80">
            Your ServiceSync account manager and executive have signed this agreement. Review the PDF,
            then sign to accept.
          </p>
          <SignaturePad disabled={busy} onChange={setSignatureData} autoPopulateName="Chad Stefaniak" />
          <label className="label cursor-pointer justify-start gap-2">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            <span className="label-text text-sm">
              I confirm this electronic signature as {profileName} and accept the agreement.
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={signAndAccept}>
              {busy ? "Signing…" : "Sign & accept contract"}
            </button>
          </div>
          <div className="border-t border-base-300 pt-3 space-y-2">
            <p className="text-xs font-medium opacity-70">Or reject this agreement</p>
            <textarea
              className="textarea textarea-bordered textarea-sm w-full"
              rows={2}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection"
            />
            <button type="button" className="btn btn-outline btn-error btn-xs" disabled={busy} onClick={reject}>
              Reject agreement
            </button>
          </div>
        </>
      ) : null}

      {executed ? (
        <p className="text-sm opacity-80">This agreement is fully executed and active.</p>
      ) : null}
    </div>
  );
}

