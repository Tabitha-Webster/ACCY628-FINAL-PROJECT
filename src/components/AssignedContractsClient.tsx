"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/ui";
import { CONTRACT_STATUS_LABELS, CONTRACT_TYPE_LABELS } from "@/lib/contracts";
import { statusLabel } from "@/lib/format";
import {
  formatTechnicianOptionLabel,
  canReassignTechnicianForStatus,
  recommendedTechnicianId,
  skillLevelLabel,
  skillLevelTone,
  technicianFitScore,
  type TechnicianSkillProfile,
} from "@/lib/technicians/skills";

export type AssignedContractRow = {
  id: string;
  contract_number: string;
  name: string;
  status: string;
  contract_type: string;
  work_location: string | null;
  included_services: string | null;
  assigned_technician_id: string | null;
  customer_name: string;
};

type PendingChange = {
  contractId: string;
  contractNumber: string;
  contractName: string;
  fromTechnicianId: string | null;
  toTechnicianId: string | null;
};

export function AssignedContractsClient({
  contracts,
  technicians,
  canAssign = false,
}: {
  contracts: AssignedContractRow[];
  technicians: TechnicianSkillProfile[];
  /** Only managers may change assignments. */
  canAssign?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState(contracts);
  const [techFilter, setTechFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (techFilter === "unassigned" && row.assigned_technician_id) return false;
      if (techFilter !== "all" && techFilter !== "unassigned" && row.assigned_technician_id !== techFilter) {
        return false;
      }
      if (!q) return true;
      return (
        row.contract_number.toLowerCase().includes(q) ||
        row.name.toLowerCase().includes(q) ||
        row.customer_name.toLowerCase().includes(q)
      );
    });
  }, [rows, techFilter, query]);

  function techName(id: string | null) {
    if (!id) return "Unassigned";
    return technicians.find((t) => t.id === id)?.full_name ?? "Unknown technician";
  }

  function requestAssignmentChange(row: AssignedContractRow, technicianId: string) {
    if (!canAssign) return;
    if (!canReassignTechnicianForStatus(row.status)) {
      setError("Technician assignment can only be changed on draft, pending approval, or active contracts.");
      return;
    }
    const nextId = technicianId || null;
    if (nextId === row.assigned_technician_id) return;
    setError(null);
    setMessage(null);
    setPendingChange({
      contractId: row.id,
      contractNumber: row.contract_number,
      contractName: row.name,
      fromTechnicianId: row.assigned_technician_id,
      toTechnicianId: nextId,
    });
  }

  function cancelAssignmentChange() {
    setPendingChange(null);
  }

  async function confirmAssignmentChange() {
    if (!canAssign || !pendingChange) return;

    const row = rows.find((r) => r.id === pendingChange.contractId);
    if (!row || !canReassignTechnicianForStatus(row.status)) {
      setError("Technician assignment can only be changed on draft, pending approval, or active contracts.");
      setPendingChange(null);
      return;
    }

    const { contractId, toTechnicianId } = pendingChange;
    setError(null);
    setMessage(null);
    setPendingId(contractId);

    const { error: updateError } = await supabase
      .from("contracts")
      .update({
        assigned_technician_id: toTechnicianId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", contractId);

    setPendingId(null);
    if (updateError) {
      setError(updateError.message);
      setPendingChange(null);
      return;
    }

    const assignedName = techName(toTechnicianId);
    startTransition(() => {
      setRows((prev) =>
        prev.map((row) =>
          row.id === contractId ? { ...row, assigned_technician_id: toTechnicianId } : row
        )
      );
      setMessage(
        toTechnicianId
          ? `Assigned ${assignedName} to ${pendingChange.contractNumber}.`
          : `Cleared technician assignment on ${pendingChange.contractNumber}.`
      );
      setPendingChange(null);
    });
  }

  const saving = pendingId != null || isPending;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
              Technician skills
            </h2>
            <p className="text-sm opacity-70">
              Use specialty and skill level to match the right technician to each contract.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {technicians.map((tech) => (
            <article
              key={tech.id}
              className="rounded-2xl border border-base-300 bg-base-100 p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{tech.full_name}</p>
                  <p className="mt-0.5 text-sm opacity-70">
                    {tech.primary_specialty ?? "General support"}
                  </p>
                </div>
                <span className={`badge badge-sm shrink-0 ${skillLevelTone(tech.skill_level)}`}>
                  {skillLevelLabel(tech.skill_level)}
                </span>
              </div>
              {(tech.skill_tags ?? []).length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(tech.skill_tags ?? []).map((tag) => (
                    <span key={tag} className="badge badge-ghost badge-sm">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
              <p className="mt-3 text-xs opacity-60">
                {rows.filter((r) => r.assigned_technician_id === tech.id).length} contract
                {rows.filter((r) => r.assigned_technician_id === tech.id).length === 1 ? "" : "s"}{" "}
                assigned
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
              Contract assignments
            </h2>
            <p className="text-sm opacity-70">
              {canAssign
                ? "Managers can reassign technicians on draft, pending approval, and active contracts. Expired, canceled, and other completed agreements are locked."
                : "View-only: only managers can change technician assignments."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="search"
              className="input input-bordered input-sm w-52"
              placeholder="Search contracts…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              className="select select-bordered select-sm"
              value={techFilter}
              onChange={(e) => setTechFilter(e.target.value)}
            >
              <option value="all">All technicians</option>
              <option value="unassigned">Unassigned only</option>
              {technicians.map((tech) => (
                <option key={tech.id} value={tech.id}>
                  {tech.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error ? (
          <div className="alert alert-error text-sm">
            <span>{error}</span>
          </div>
        ) : null}
        {message ? (
          <div className="alert alert-success text-sm">
            <span>{message}</span>
          </div>
        ) : null}

        {filtered.length === 0 ? (
          <div className="rounded-box border border-dashed border-base-300 p-8 text-center text-sm opacity-70">
            No contracts match this filter.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-box border border-base-300">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Contract</th>
                  <th>Customer</th>
                  <th>Type / location</th>
                  <th>Status</th>
                  <th>Recommended</th>
                  <th className="min-w-[18rem]">Assigned technician</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const recommendedId = recommendedTechnicianId(technicians, row);
                  const recommended = technicians.find((t) => t.id === recommendedId);
                  const rowSaving = pendingId === row.id;
                  const canEditRow = canAssign && canReassignTechnicianForStatus(row.status);
                  return (
                    <tr key={row.id}>
                      <td>
                        <Link href={`/contracts/${row.id}`} className="link link-hover font-medium">
                          {row.contract_number}
                        </Link>
                        <p className="max-w-[14rem] truncate text-xs opacity-70" title={row.name}>
                          {row.name}
                        </p>
                      </td>
                      <td>{row.customer_name}</td>
                      <td>
                        <p className="text-sm">
                          {CONTRACT_TYPE_LABELS[
                            row.contract_type as keyof typeof CONTRACT_TYPE_LABELS
                          ] ?? statusLabel(row.contract_type)}
                        </p>
                        <p className="text-xs opacity-60">
                          {row.work_location === "on_site" ? "On-site" : "Remote"}
                        </p>
                      </td>
                      <td>
                        <StatusBadge
                          status={row.status}
                          label={
                            CONTRACT_STATUS_LABELS[
                              row.status as keyof typeof CONTRACT_STATUS_LABELS
                            ] ?? row.status
                          }
                        />
                      </td>
                      <td>
                        {recommended ? (
                          <div className="text-xs">
                            <p className="font-medium">{recommended.full_name}</p>
                            <p className="opacity-60">
                              Fit{" "}
                              {technicianFitScore({
                                tech: recommended,
                                contractType: row.contract_type,
                                includedServices: row.included_services,
                                workLocation: row.work_location,
                              })}
                              % · {skillLevelLabel(recommended.skill_level)}
                            </p>
                          </div>
                        ) : (
                          <span className="opacity-50">—</span>
                        )}
                      </td>
                      <td>
                        {canEditRow ? (
                          <select
                            className="select select-bordered select-sm w-full max-w-md"
                            value={row.assigned_technician_id ?? ""}
                            disabled={saving || rowSaving || pendingChange != null}
                            onChange={(e) => requestAssignmentChange(row, e.target.value)}
                          >
                            <option value="">Unassigned</option>
                            {technicians.map((tech) => (
                              <option key={tech.id} value={tech.id}>
                                {formatTechnicianOptionLabel(tech)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div>
                            <p className="text-sm">{techName(row.assigned_technician_id)}</p>
                            {canAssign ? (
                              <p className="mt-0.5 text-xs opacity-60">
                                Assignment locked for this status
                              </p>
                            ) : null}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {pendingChange ? (
        <div className="modal modal-open" role="dialog" aria-modal="true" aria-labelledby="assign-confirm-title">
          <div className="modal-box">
            <h3 id="assign-confirm-title" className="text-lg font-semibold">
              Confirm technician change
            </h3>
            <p className="py-3 text-sm opacity-80">
              Update assignment for{" "}
              <span className="font-medium">
                {pendingChange.contractNumber} — {pendingChange.contractName}
              </span>
              ?
            </p>
            <div className="rounded-box border border-base-300 bg-base-200/60 p-3 text-sm">
              <p>
                <span className="opacity-60">From:</span>{" "}
                <span className="font-medium">{techName(pendingChange.fromTechnicianId)}</span>
              </p>
              <p className="mt-1">
                <span className="opacity-60">To:</span>{" "}
                <span className="font-medium">{techName(pendingChange.toTechnicianId)}</span>
              </p>
            </div>
            <div className="modal-action">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={pendingId != null}
                onClick={cancelAssignmentChange}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={pendingId != null}
                onClick={() => {
                  void confirmAssignmentChange();
                }}
              >
                {pendingId != null ? "Saving…" : "Confirm"}
              </button>
            </div>
          </div>
          <button
            type="button"
            className="modal-backdrop bg-black/40"
            aria-label="Cancel"
            disabled={pendingId != null}
            onClick={cancelAssignmentChange}
          />
        </div>
      ) : null}
    </div>
  );
}
