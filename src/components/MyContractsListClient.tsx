"use client";

import { useMemo, useState } from "react";
import { EmptyState, StatusBadge, Money, Hours, DateText } from "@/components/ui";
import { CustomerContractSignaturePanel } from "@/components/CustomerContractSignaturePanel";
import { CustomerContractPdfActions } from "@/components/CustomerContractPdfActions";
import {
  CONTRACT_STATUS_LABELS,
  billedMonthlyRecurringFee,
} from "@/lib/contracts";
import type { ContractSignaturePacket } from "@/lib/contracts/signature-packets";
import { statusLabel } from "@/lib/format";
import type { Contract, ContractService, ContractStatus } from "@/lib/types";

export type MyContractListItem = {
  contract: Contract;
  services: ContractService[];
  managerName: string | null;
  packet: ContractSignaturePacket | null;
};

type FilterKey =
  | "all"
  | "active"
  | "pending_approval"
  | "awaiting_signature"
  | "on_hold"
  | "completed"
  | "canceled";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "pending_approval", label: "Pending Approval" },
  { key: "awaiting_signature", label: "Waiting for Your Signature" },
  { key: "on_hold", label: "On Hold" },
  { key: "completed", label: "Completed" },
  { key: "canceled", label: "Canceled" },
];

const COMPLETED_STATUSES: ContractStatus[] = ["expired", "renewed"];

function toPdfContract(c: Contract) {
  return {
    id: c.id,
    customer_id: c.customer_id,
    contract_number: c.contract_number,
    name: c.name,
    status: c.status,
    contract_type: c.contract_type,
    start_date: c.start_date,
    end_date: c.end_date,
    monthly_recurring_fee: c.monthly_recurring_fee,
    work_location: c.work_location,
    included_hours_per_month: c.included_hours_per_month,
    additional_hourly_rate: c.additional_hourly_rate,
    payment_terms: c.payment_terms,
    billing_frequency: c.billing_frequency,
    sla_response_hours: c.sla_response_hours,
    sla_resolution_hours: c.sla_resolution_hours,
    description: c.description,
    scope: c.scope,
    included_services: c.included_services,
  };
}

function matchesFilter(item: MyContractListItem, filter: FilterKey) {
  if (filter === "all") return true;
  const { contract, packet } = item;
  if (filter === "awaiting_signature") return packet?.status === "awaiting_customer";
  if (filter === "completed") return COMPLETED_STATUSES.includes(contract.status);
  if (filter === "canceled") return contract.status === "canceled";
  if (filter === "on_hold") return contract.status === "on_hold";
  if (filter === "active") return contract.status === "active";
  if (filter === "pending_approval") {
    return contract.status === "pending_approval" || contract.status === "draft";
  }
  return true;
}

function ContractCard({
  item,
  customerName,
  profileId,
  profileName,
}: {
  item: MyContractListItem;
  customerName: string;
  profileId: string;
  profileName: string;
}) {
  const { contract, services, managerName, packet } = item;
  const needsSignature = packet?.status === "awaiting_customer";
  const pdfContract = toPdfContract(contract);
  const statusText =
    CONTRACT_STATUS_LABELS[contract.status as ContractStatus] ?? statusLabel(contract.status);

  return (
    <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50/70 to-base-100 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-emerald-950">{contract.name}</p>
          <p className="text-xs opacity-60">
            {contract.contract_number} · {contract.contract_type.replace(/_/g, " ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={contract.status} label={statusText} />
          {needsSignature ? (
            <StatusBadge status="awaiting_customer" label="Sign to activate" />
          ) : null}
        </div>
      </div>

      {contract.status === "pending_approval" && !needsSignature ? (
        <p className="mt-3 text-sm opacity-70">
          This agreement is awaiting ServiceSync signatures and is not active yet. When it is ready
          for you, you will be asked to sign and accept it here.
        </p>
      ) : null}

      {needsSignature ? (
        <p className="mt-3 text-sm opacity-70">
          Your account manager and executive have signed. Review the agreement below, then sign and
          accept to activate it.
        </p>
      ) : null}

      {contract.status !== "pending_approval" || needsSignature ? (
        <CustomerContractPdfActions
          className="mt-3"
          contract={pdfContract}
          customerName={customerName}
          managerName={managerName}
          packet={packet}
        />
      ) : null}

      {contract.description ? (
        <p className="mt-2 text-sm leading-relaxed opacity-80">{contract.description}</p>
      ) : null}

      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-3">
          <dt className="opacity-60">Monthly Fee</dt>
          <dd className="font-medium">
            <Money value={billedMonthlyRecurringFee(contract)} />
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="opacity-60">Included Hours / Month</dt>
          <dd className="font-medium">
            <Hours value={Number(contract.included_hours_per_month)} />
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="opacity-60">Additional Hourly Rate</dt>
          <dd className="font-medium">
            <Money value={Number(contract.additional_hourly_rate)} />
            /hr
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="opacity-60">Term</dt>
          <dd className="font-medium">
            <DateText value={contract.start_date} /> –{" "}
            {contract.end_date ? <DateText value={contract.end_date} /> : "Ongoing"}
          </dd>
        </div>
        {contract.sla_response_hours != null ? (
          <div className="flex justify-between gap-3">
            <dt className="opacity-60">SLA Response</dt>
            <dd>{contract.sla_response_hours} hrs</dd>
          </div>
        ) : null}
        {contract.sla_resolution_hours != null ? (
          <div className="flex justify-between gap-3">
            <dt className="opacity-60">SLA Resolution</dt>
            <dd>{contract.sla_resolution_hours} hrs</dd>
          </div>
        ) : null}
        {contract.payment_terms ? (
          <div className="flex justify-between gap-3">
            <dt className="opacity-60">Payment Terms</dt>
            <dd>{contract.payment_terms}</dd>
          </div>
        ) : null}
        {contract.billing_frequency ? (
          <div className="flex justify-between gap-3">
            <dt className="opacity-60">Billing Frequency</dt>
            <dd className="capitalize">{contract.billing_frequency.replace(/_/g, " ")}</dd>
          </div>
        ) : null}
      </dl>

      {services.length ? (
        <div className="mt-3 border-t border-emerald-200/70 pt-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-900/70">
            Services
          </p>
          <ul className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
            {services.map((s) => (
              <li key={s.id ?? s.service_name} className="flex items-center gap-2 text-sm">
                <span
                  className={`badge badge-xs ${s.is_included ? "badge-success" : "badge-ghost"}`}
                />
                {s.service_name}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {packet &&
      (packet.status === "awaiting_customer" || packet.status === "fully_executed") ? (
        <CustomerContractSignaturePanel
          contract={pdfContract}
          customerName={customerName}
          managerName={managerName}
          profileId={profileId}
          profileName={profileName}
          packet={packet}
        />
      ) : null}
    </div>
  );
}

export function MyContractsListClient({
  items,
  customerName,
  profileId,
  profileName,
}: {
  items: MyContractListItem[];
  customerName: string;
  profileId: string;
  profileName: string;
}) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const counts = useMemo(() => {
    const next: Record<FilterKey, number> = {
      all: items.length,
      active: 0,
      pending_approval: 0,
      awaiting_signature: 0,
      on_hold: 0,
      completed: 0,
      canceled: 0,
    };
    for (const item of items) {
      for (const key of Object.keys(next) as FilterKey[]) {
        if (key === "all") continue;
        if (matchesFilter(item, key)) next[key] += 1;
      }
    }
    return next;
  }, [items]);

  const visibleFilters = FILTERS.filter((f) => f.key === "all" || counts[f.key] > 0);

  const filtered = useMemo(
    () => items.filter((item) => matchesFilter(item, filter)),
    [items, filter]
  );

  return (
    <div className="max-w-3xl space-y-4">
      <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50/70 to-base-100 p-3 shadow-sm">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-900/70">
          Filter contracts
        </p>
        <div className="flex flex-wrap gap-2">
          {visibleFilters.map((option) => {
            const active = filter === option.key;
            const count = counts[option.key];
            return (
              <button
                key={option.key}
                type="button"
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-emerald-200 bg-white/90 text-emerald-950 hover:border-emerald-300 hover:bg-emerald-50"
                }`}
                onClick={() => setFilter(option.key)}
                aria-pressed={active}
              >
                <span>{option.label}</span>
                <span
                  className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] tabular-nums ${
                    active ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-900"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs opacity-60" aria-live="polite">
          Showing {filtered.length} of {items.length} contract{items.length === 1 ? "" : "s"}
        </p>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No contracts match this filter"
          description="Try another status, or choose All to see every agreement."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <ContractCard
              key={item.contract.id}
              item={item}
              customerName={customerName}
              profileId={profileId}
              profileName={profileName}
            />
          ))}
        </div>
      )}
    </div>
  );
}
