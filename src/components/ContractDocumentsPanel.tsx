"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, History, Replace, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState, StatusBadge } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import {
  CONTRACT_DOCUMENT_TYPES,
  formatBytes,
  unwrapProfile,
  type ContractDocument,
} from "@/lib/contracts";

export type ContractDocumentRow = ContractDocument & {
  uploaded_by_profile?: { full_name: string } | { full_name: string }[] | null;
};

type Props = {
  contractId: string;
  profileId: string;
  canManage: boolean;
  documents: ContractDocumentRow[];
};

function uploaderName(doc: ContractDocumentRow) {
  return unwrapProfile(doc.uploaded_by_profile)?.full_name ?? "—";
}

export function ContractDocumentsPanel({
  contractId,
  profileId,
  canManage,
  documents,
}: Props) {
  const router = useRouter();
  const [docName, setDocName] = useState("");
  const [docType, setDocType] = useState<string>("signed_contract");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [historyGroupId, setHistoryGroupId] = useState<string | null>(null);
  const [historyRows, setHistoryRows] = useState<ContractDocumentRow[]>([]);
  const [replaceTarget, setReplaceTarget] = useState<ContractDocumentRow | null>(null);
  const [replaceReason, setReplaceReason] = useState("");
  const [replaceFile, setReplaceFile] = useState<File | null>(null);

  const currentDocs = useMemo(
    () => documents.filter((d) => d.is_current).sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at)),
    [documents]
  );

  async function uploadFileToStorage(fileToUpload: File, path: string) {
    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from("contract-documents")
      .upload(path, fileToUpload, {
        upsert: false,
        contentType: fileToUpload.type || undefined,
      });
    if (uploadError) throw new Error(uploadError.message);
    return path;
  }

  async function createSignedUrl(path: string) {
    const supabase = createClient();
    const { data, error: signError } = await supabase.storage
      .from("contract-documents")
      .createSignedUrl(path, 60 * 10);
    if (signError) throw new Error(signError.message);
    return data.signedUrl;
  }

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!canManage) {
      setError("Only managers can upload contract documents.");
      return;
    }
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    if (!docName.trim()) {
      setError("Enter a document name.");
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${contractId}/${crypto.randomUUID()}-${safeName}`;
      await uploadFileToStorage(file, path);

      const groupId = crypto.randomUUID();
      const { error: insertError } = await supabase.from("contract_documents").insert({
        contract_id: contractId,
        document_name: docName.trim(),
        document_type: docType,
        storage_path: path,
        file_url: null,
        uploaded_by: profileId,
        notes: notes.trim() || null,
        document_group_id: groupId,
        version_number: 1,
        is_current: true,
        file_size: file.size,
        mime_type: file.type || null,
      });
      if (insertError) throw new Error(insertError.message);

      setDocName("");
      setNotes("");
      setFile(null);
      setDocType("signed_contract");
      setMessage("Document uploaded.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function onDownload(doc: ContractDocumentRow) {
    setError(null);
    try {
      if (!doc.storage_path) {
        if (doc.file_url) {
          window.open(doc.file_url, "_blank", "noopener,noreferrer");
          return;
        }
        throw new Error("No file path available for download.");
      }
      const url = await createSignedUrl(doc.storage_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
    }
  }

  async function loadHistory(groupId: string) {
    setError(null);
    if (historyGroupId === groupId) {
      setHistoryGroupId(null);
      setHistoryRows([]);
      return;
    }
    const supabase = createClient();
    const { data, error: histError } = await supabase
      .from("contract_documents")
      .select(
        "id, contract_id, document_name, document_type, storage_path, file_url, uploaded_by, uploaded_at, notes, document_group_id, version_number, is_current, file_size, mime_type, replace_reason, replaced_at, uploaded_by_profile:profiles!contract_documents_uploaded_by_fkey(full_name)"
      )
      .eq("document_group_id", groupId)
      .order("version_number", { ascending: false });
    if (histError) {
      setError(histError.message);
      return;
    }
    setHistoryGroupId(groupId);
    setHistoryRows((data ?? []) as ContractDocumentRow[]);
  }

  async function onReplace(e: React.FormEvent) {
    e.preventDefault();
    if (!replaceTarget || !canManage) return;
    setError(null);
    setMessage(null);
    if (!replaceFile) {
      setError("Choose a replacement file.");
      return;
    }
    if (!replaceReason.trim()) {
      setError("Enter a reason for replacing this document.");
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const safeName = replaceFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${contractId}/${crypto.randomUUID()}-${safeName}`;
      await uploadFileToStorage(replaceFile, path);

      const nextVersion = Number(replaceTarget.version_number ?? 1) + 1;
      const nowIso = new Date().toISOString();

      const { error: archiveError } = await supabase
        .from("contract_documents")
        .update({
          is_current: false,
          replaced_at: nowIso,
          replace_reason: replaceReason.trim(),
        })
        .eq("id", replaceTarget.id);
      if (archiveError) throw new Error(archiveError.message);

      const { error: insertError } = await supabase.from("contract_documents").insert({
        contract_id: contractId,
        document_name: replaceTarget.document_name,
        document_type: replaceTarget.document_type,
        storage_path: path,
        file_url: null,
        uploaded_by: profileId,
        notes: replaceTarget.notes,
        document_group_id: replaceTarget.document_group_id,
        version_number: nextVersion,
        is_current: true,
        file_size: replaceFile.size,
        mime_type: replaceFile.type || null,
        replace_reason: replaceReason.trim(),
      });
      if (insertError) throw new Error(insertError.message);

      setReplaceTarget(null);
      setReplaceFile(null);
      setReplaceReason("");
      setMessage(`Document replaced as version ${nextVersion}.`);
      setHistoryGroupId(null);
      setHistoryRows([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Replace failed.");
    } finally {
      setUploading(false);
    }
  }

  function typeLabel(value: string | null) {
    return CONTRACT_DOCUMENT_TYPES.find((t) => t.value === value)?.label ?? value ?? "—";
  }

  return (
    <div className="space-y-4">
      {error ? <div className="alert alert-error text-sm">{error}</div> : null}
      {message ? <div className="alert alert-success text-sm">{message}</div> : null}

      {canManage ? (
        <form className="rounded-box border border-dashed border-base-300 bg-base-200/40 p-4" onSubmit={onUpload}>
          <p className="mb-3 text-sm font-semibold">Upload signed contracts, amendments, and SOWs</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="form-control">
              <span className="label-text mb-1 text-xs">Document name</span>
              <input
                className="input input-bordered input-sm"
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                placeholder="Master Service Agreement"
              />
            </label>
            <label className="form-control">
              <span className="label-text mb-1 text-xs">Document type</span>
              <select
                className="select select-bordered select-sm"
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
              >
                {CONTRACT_DOCUMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-control">
              <span className="label-text mb-1 text-xs">File</span>
              <input
                type="file"
                className="file-input file-input-bordered file-input-sm w-full"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <label className="form-control">
              <span className="label-text mb-1 text-xs">Notes</span>
              <input
                className="input input-bordered input-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
              />
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <button type="submit" className="btn btn-primary btn-sm" disabled={uploading}>
              <Upload className="h-4 w-4" />
              {uploading ? "Uploading…" : "Upload document"}
            </button>
          </div>
        </form>
      ) : null}

      {currentDocs.length === 0 ? (
        <EmptyState
          title="No documents attached"
          description="Signed PDFs, amendments, and SOWs will appear here once uploaded."
        />
      ) : (
        <div className="overflow-x-auto rounded-box border border-base-300">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Document</th>
                <th>Type</th>
                <th>Version</th>
                <th>Size</th>
                <th>Uploaded</th>
                <th>By</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {currentDocs.map((doc) => (
                <tr key={doc.id}>
                  <td className="font-medium">{doc.document_name}</td>
                  <td className="text-xs">{typeLabel(doc.document_type)}</td>
                  <td>
                    <StatusBadge status="active" label={`v${doc.version_number}`} />
                  </td>
                  <td className="text-xs">{formatBytes(doc.file_size)}</td>
                  <td className="text-xs">{formatDateTime(doc.uploaded_at)}</td>
                  <td className="text-xs">{uploaderName(doc)}</td>
                  <td className="text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        onClick={() => onDownload(doc)}
                        title="Download"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        onClick={() => loadHistory(doc.document_group_id)}
                        title="Version history"
                      >
                        <History className="h-3.5 w-3.5" />
                      </button>
                      {canManage ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          onClick={() => {
                            setReplaceTarget(doc);
                            setReplaceReason("");
                            setReplaceFile(null);
                          }}
                          title="Replace"
                        >
                          <Replace className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {historyGroupId && historyRows.length > 0 ? (
        <div className="rounded-box border border-base-300 bg-base-200/40 p-3">
          <p className="mb-2 text-sm font-semibold">Document version history</p>
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Current</th>
                  <th>Uploaded</th>
                  <th>By</th>
                  <th>Replace reason</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {historyRows.map((row) => (
                  <tr key={row.id}>
                    <td>v{row.version_number}</td>
                    <td>{row.is_current ? <span className="badge badge-success badge-sm">Current</span> : "—"}</td>
                    <td className="text-xs">{formatDateTime(row.uploaded_at)}</td>
                    <td className="text-xs">{uploaderName(row)}</td>
                    <td className="text-xs">{row.replace_reason ?? "—"}</td>
                    <td className="text-right">
                      <button type="button" className="btn btn-ghost btn-xs" onClick={() => onDownload(row)}>
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {replaceTarget ? (
        <form className="rounded-box border border-warning/40 bg-warning/5 p-4" onSubmit={onReplace}>
          <p className="mb-2 text-sm font-semibold">
            Replace document: {replaceTarget.document_name} (v{replaceTarget.version_number})
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="form-control">
              <span className="label-text mb-1 text-xs">Replacement file</span>
              <input
                type="file"
                className="file-input file-input-bordered file-input-sm w-full"
                onChange={(e) => setReplaceFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <label className="form-control">
              <span className="label-text mb-1 text-xs">Reason for replacement *</span>
              <input
                className="input input-bordered input-sm"
                value={replaceReason}
                onChange={(e) => setReplaceReason(e.target.value)}
                placeholder="Corrected signature page / updated SOW"
                required
              />
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setReplaceTarget(null)}
              disabled={uploading}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-warning btn-sm" disabled={uploading}>
              {uploading ? "Replacing…" : "Replace document"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
