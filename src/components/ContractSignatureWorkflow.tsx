"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/ui";
import { SignaturePad } from "@/components/SignaturePad";
import { buildContractPdfBlob, downloadPdfBlob } from "@/lib/contracts/build-contract-pdf";
import {
  SIGNATURE_PACKET_STATUS_LABELS,
  packetSignaturesForPdf,
  type ContractPdfInput,
  type ContractSignaturePacket,
  type SignaturePacketStatus,
} from "@/lib/contracts/signature-packets";
import type { UserRole } from "@/lib/constants";
import type { Contract } from "@/lib/types";

type ContractForPdf = ContractPdfInput["contract"];

type Props = {
  contract: ContractForPdf & Pick<Contract, "id" | "customer_id" | "status">;
  customerName: string;
  managerName: string | null;
  profileId: string;
  profileName: string;
  role: UserRole;
  initialPacket: ContractSignaturePacket | null;
};

export function ContractSignatureWorkflow({
  contract,
  customerName,
  managerName,
  profileId,
  profileName,
  role,
  initialPacket,
}: Props) {
  const router = useRouter();
  const [packet, setPacket] = useState<ContractSignaturePacket | null>(initialPacket);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isManager = role === "manager";
  const isExecutive = role === "executive";
  const canAct = isManager || isExecutive;

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
      if (!cancelled) setError(err instanceof Error ? err.message : "Could not build PDF preview.");
    });
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [pdfInput]);

  async function refreshPacket(id: string) {
    const supabase = createClient();
    const { data } = await supabase.from("contract_signature_packets").select("*").eq("id", id).maybeSingle();
    if (data) setPacket(data as ContractSignaturePacket);
  }

  async function createPacket() {
    if (!isManager) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();

    if (packet?.is_current && packet.status !== "rejected" && packet.status !== "fully_executed") {
      setBusy(false);
      setError("A signature packet is already in progress for this contract.");
      return;
    }

    if (packet?.is_current) {
      await supabase
        .from("contract_signature_packets")
        .update({ is_current: false, updated_at: new Date().toISOString() })
        .eq("id", packet.id);
    }

    const { data, error: insertError } = await supabase
      .from("contract_signature_packets")
      .insert({
        contract_id: contract.id,
        status: "draft",
        is_current: true,
        created_by: profileId,
      })
      .select("*")
      .single();

    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setPacket(data as ContractSignaturePacket);
    setMessage("PDF packet created. Sign as manager to send it to the executive.");
    setSignatureData(null);
    setAck(false);
    router.refresh();
  }

  async function uploadPdfVersion(nextPacket: ContractSignaturePacket) {
    const blob = await buildContractPdfBlob({
      contract,
      customerName,
      managerName,
      signatures: packetSignaturesForPdf(nextPacket),
    });
    const path = `${contract.id}/signature-packets/${nextPacket.id}-${Date.now()}.pdf`;
    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from("contract-documents")
      .upload(path, blob, { contentType: "application/pdf", upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    const { data, error: updateError } = await supabase
      .from("contract_signature_packets")
      .update({ storage_path: path, updated_at: new Date().toISOString() })
      .eq("id", nextPacket.id)
      .select("*")
      .single();
    if (updateError) throw new Error(updateError.message);
    setPacket(data as ContractSignaturePacket);
  }

  async function managerSignAndSend() {
    if (!packet || !isManager) return;
    if (!signatureData) {
      setError("Draw your signature before sending to the executive.");
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
        status: "awaiting_executive" as SignaturePacketStatus,
        manager_signed_by: profileId,
        manager_signed_at: signedAt,
        manager_signature_data: signatureData,
        manager_signer_name: profileName,
        updated_at: signedAt,
        rejection_reason: null,
        rejected_by: null,
        rejected_at: null,
      })
      .eq("id", packet.id)
      .select("*")
      .single();

    if (updateError) {
      setBusy(false);
      setError(updateError.message);
      return;
    }

    await supabase
      .from("contracts")
      .update({
        status: "pending_approval",
        updated_by: profileId,
        updated_at: signedAt,
      })
      .eq("id", contract.id);

    await supabase.from("contract_changes").insert({
      contract_id: contract.id,
      field_name: "signature_packet",
      previous_value: packet.status,
      new_value: "awaiting_executive",
      change_reason: "Manager signed PDF and sent to executive",
      changed_by: profileId,
      source: "signature_workflow",
    });

    try {
      await uploadPdfVersion(data as ContractSignaturePacket);
      setMessage("Manager signature captured. Sent to the executive for signature.");
      setSignatureData(null);
      setAck(false);
      router.refresh();
    } catch (err) {
      await refreshPacket(packet.id);
      setError(err instanceof Error ? err.message : "Signed, but PDF save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function executiveSignAndSend() {
    if (!packet || !isExecutive) return;
    if (packet.status !== "awaiting_executive" && packet.status !== "awaiting_admin") {
      setError("This packet is not waiting for executive signature.");
      return;
    }
    if (!signatureData) {
      setError("Draw your signature before sending to the customer.");
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
    const optimisticPacket: ContractSignaturePacket = {
      ...packet,
      status: "awaiting_customer",
      executive_signed_by: profileId,
      executive_signed_at: signedAt,
      executive_signature_data: signatureData,
      executive_signer_name: profileName,
      updated_at: signedAt,
    };

    try {
      // Build + upload PDF first, then persist signature + storage_path in one update
      // so RLS cannot block a follow-up write after status flips to awaiting_customer.
      const blob = await buildContractPdfBlob({
        contract,
        customerName,
        managerName,
        signatures: packetSignaturesForPdf(optimisticPacket),
      });
      const path = `${contract.id}/signature-packets/${packet.id}-${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("contract-documents")
        .upload(path, blob, { contentType: "application/pdf", upsert: true });
      if (uploadError) throw new Error(uploadError.message);

      const { data, error: updateError } = await supabase
        .from("contract_signature_packets")
        .update({
          status: "awaiting_customer",
          executive_signed_by: profileId,
          executive_signed_at: signedAt,
          executive_signature_data: signatureData,
          executive_signer_name: profileName,
          storage_path: path,
          updated_at: signedAt,
        })
        .eq("id", packet.id)
        .select("*")
        .single();

      if (updateError) throw new Error(updateError.message);

      await supabase.from("contract_changes").insert({
        contract_id: contract.id,
        field_name: "signature_packet",
        previous_value: packet.status,
        new_value: "awaiting_customer",
        change_reason: "Executive signed PDF and released to customer",
        changed_by: profileId,
        source: "signature_workflow",
      });

      setPacket(data as ContractSignaturePacket);
      setMessage("Executive signature captured. Contract sent to the customer for final signature.");
      setSignatureData(null);
      setAck(false);
      router.refresh();
    } catch (err) {
      await refreshPacket(packet.id);
      setError(err instanceof Error ? err.message : "Could not save executive signature.");
    } finally {
      setBusy(false);
    }
  }

  async function rejectPacket() {
    if (!packet || !canAct) return;
    if (!rejectReason.trim()) {
      setError("Enter a rejection reason.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
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
    setMessage("Signature packet rejected. Contract returned to draft.");
    router.refresh();
  }

  async function onDownload() {
    const blob = await buildContractPdfBlob(pdfInput);
    downloadPdfBlob(blob, `${contract.contract_number}-agreement.pdf`);
  }

  async function onPrint() {
    if (!previewUrl) return;
    const win = window.open(previewUrl);
    win?.addEventListener("load", () => win.print());
  }

  const canStart = isManager && (!packet || packet.status === "rejected" || packet.status === "fully_executed");
  const showManagerSignForm = isManager && packet?.status === "draft";
  const showExecutiveSignForm =
    isExecutive && (packet?.status === "awaiting_executive" || packet?.status === "awaiting_admin");
  const showReject =
    canAct &&
    (packet?.status === "awaiting_executive" ||
      packet?.status === "awaiting_admin" ||
      packet?.status === "awaiting_customer");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm opacity-70">
            Flow: Manager signs and sends to the executive → Executive signs and sends to the
            customer → Customer signs and accepts in My Contracts → contract becomes Active.
          </p>
          {packet ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge
                status={packet.status}
                label={SIGNATURE_PACKET_STATUS_LABELS[packet.status]}
              />
              {packet.rejection_reason ? (
                <span className="text-xs text-error">Reason: {packet.rejection_reason}</span>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-sm opacity-60">No signature packet yet.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canStart && !packet ? (
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={createPacket}>
              {busy ? "Creating…" : "Create PDF for signatures"}
            </button>
          ) : null}
          {packet?.status === "rejected" && isManager ? (
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={createPacket}>
              Start new signature packet
            </button>
          ) : null}
          {previewUrl ? (
            <>
              <button type="button" className="btn btn-outline btn-sm" onClick={onDownload}>
                Download PDF
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onPrint}>
                Print
              </button>
            </>
          ) : null}
        </div>
      </div>

      {error ? <div className="alert alert-error text-sm">{error}</div> : null}
      {message ? <div className="alert alert-success text-sm">{message}</div> : null}

      {previewUrl ? (
        <iframe
          title="Contract PDF preview"
          src={previewUrl}
          className="h-[28rem] w-full rounded-box border border-base-300 bg-base-100"
        />
      ) : (
        <div className="rounded-box border border-dashed border-base-300 p-6 text-sm opacity-60">
          PDF preview will appear once generated.
        </div>
      )}

      {showManagerSignForm ? (
        <div className="rounded-box border border-base-300 bg-base-100 p-4 space-y-3">
          <h3 className="text-sm font-semibold">Manager signature</h3>
          <p className="text-xs opacity-60">Sign to send this PDF to the executive for countersignature.</p>
          <SignaturePad disabled={busy} onChange={setSignatureData} autoPopulateName="Emilie Pierson" />
          <label className="label cursor-pointer justify-start gap-2">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            <span className="label-text text-sm">
              I confirm this electronic signature as {profileName} (Manager).
            </span>
          </label>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={managerSignAndSend}
          >
            {busy ? "Sending…" : "Sign & send to executive"}
          </button>
        </div>
      ) : null}

      {showExecutiveSignForm ? (
        <div className="rounded-box border border-base-300 bg-base-100 p-4 space-y-3">
          <h3 className="text-sm font-semibold">Executive / CEO signature</h3>
          <p className="text-xs opacity-60">
            Review the manager-signed PDF, sign, and send it to the customer for final acceptance.
          </p>
          <SignaturePad disabled={busy} onChange={setSignatureData} autoPopulateName="Evan Bean" />
          <label className="label cursor-pointer justify-start gap-2">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            <span className="label-text text-sm">
              I confirm this electronic signature as {profileName} (Executive).
            </span>
          </label>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={executiveSignAndSend}
          >
            {busy ? "Sending…" : "Sign & send to customer"}
          </button>
        </div>
      ) : null}

      {packet?.status === "awaiting_executive" || packet?.status === "awaiting_admin" ? (
        <div className="alert alert-info text-sm">
          Waiting on the executive to sign. After that, the customer will receive the agreement in My
          Contracts.
        </div>
      ) : null}

      {packet?.status === "awaiting_customer" ? (
        <div className="alert alert-info text-sm">
          Waiting on the customer to sign in My Contracts. The agreement becomes Active after customer
          signature.
        </div>
      ) : null}

      {packet?.status === "fully_executed" ? (
        <div className="alert alert-success text-sm">
          Fully executed. The signed PDF is available here and under Contract Documents.
        </div>
      ) : null}

      {role === "admin" ? (
        <p className="text-xs opacity-60">Admin can view and download this PDF. Signing is Manager → Executive → Customer.</p>
      ) : null}

      {showReject ? (
        <div className="rounded-box border border-error/30 bg-error/5 p-4 space-y-3">
          <h3 className="text-sm font-semibold">Reject packet</h3>
          <textarea
            className="textarea textarea-bordered textarea-sm w-full"
            rows={2}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection"
          />
          <button type="button" className="btn btn-error btn-outline btn-sm" disabled={busy} onClick={rejectPacket}>
            Reject & return to draft
          </button>
        </div>
      ) : null}
    </div>
  );
}
