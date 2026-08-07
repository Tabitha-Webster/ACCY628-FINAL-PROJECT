"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { laborCost, billableCost } from "@/lib/calculations";
import { formatCurrency } from "@/lib/format";
import { DAILY_HOUR_LIMIT, LARGE_COST_THRESHOLD } from "@/lib/time-cost-config";
import {
  duplicateTimeEntryWarning,
  excessiveDailyHoursWarning,
  isLateCostEntry,
  largeCostRequiresApproval,
  lateCostEntryWarning,
  needsManagerCostReview,
  requireContract,
  requiresLargeCostApproval,
  validateHoursWorked,
} from "@/lib/time-cost-rules";

type Option = {
  id: string;
  label: string;
  customerId: string;
  projectId?: string | null;
  contractId?: string | null;
};

type Defaults = {
  customerId?: string;
  contractId?: string;
  ticketId?: string;
  projectId?: string;
};

type Props = {
  technicianId: string;
  internalCostRate: number;
  customers: { id: string; name: string }[];
  contracts: { id: string; label: string; customerId: string; additionalHourlyRate: number }[];
  tickets: Option[];
  projects: Option[];
  defaults?: Defaults;
};

const COST_CATEGORIES = [
  "software",
  "equipment",
  "replacement_parts",
  "vendor",
  "travel",
  "shipping",
  "reimbursable_expenses",
  "other",
] as const;

const COST_CATEGORY_LABELS: Record<(typeof COST_CATEGORIES)[number], string> = {
  software: "Software",
  equipment: "Equipment",
  replacement_parts: "Replacement parts",
  vendor: "Vendor",
  travel: "Travel",
  shipping: "Shipping",
  reimbursable_expenses: "Reimbursable expenses",
  other: "Other",
};

const DEFAULT_MARKUP: Record<string, number> = {
  software: 0.15,
  equipment: 0.2,
  replacement_parts: 0.2,
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function TimeCostForm({
  technicianId,
  internalCostRate,
  customers,
  contracts,
  tickets,
  projects,
  defaults,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<"time" | "cost">("time");

  // Time entry state
  const [tCustomerId, setTCustomerId] = useState(defaults?.customerId ?? "");
  const [tContractId, setTContractId] = useState(defaults?.contractId ?? "");
  const [tTicketId, setTTicketId] = useState(defaults?.ticketId ?? "");
  const [tProjectId, setTProjectId] = useState(defaults?.projectId ?? "");
  const [workDate, setWorkDate] = useState(todayStr());
  const [hours, setHours] = useState("");
  const [workCategory, setWorkCategory] = useState("");
  const [description, setDescription] = useState("");
  const [classification, setClassification] = useState<"included" | "billable" | "out_of_scope">("included");
  const [timeLoading, setTimeLoading] = useState(false);
  const [timeError, setTimeError] = useState<string | null>(null);
  const [timeMessage, setTimeMessage] = useState<string | null>(null);

  // Direct cost state
  const [cCustomerId, setCCustomerId] = useState(defaults?.customerId ?? "");
  const [cContractId, setCContractId] = useState(defaults?.contractId ?? "");
  const [cTicketId, setCTicketId] = useState(defaults?.ticketId ?? "");
  const [cProjectId, setCProjectId] = useState(defaults?.projectId ?? "");
  const [costCategory, setCostCategory] = useState<(typeof COST_CATEGORIES)[number]>("software");
  const [vendor, setVendor] = useState("");
  const [costDate, setCostDate] = useState(todayStr());
  const [internalCost, setInternalCost] = useState("");
  const [markupPct, setMarkupPct] = useState(String(DEFAULT_MARKUP.software));
  const [receiptReference, setReceiptReference] = useState("");
  const [costDescription, setCostDescription] = useState("");
  const [costLoading, setCostLoading] = useState(false);
  const [costError, setCostError] = useState<string | null>(null);
  const [costMessage, setCostMessage] = useState<string | null>(null);

  function applyTicketChoice(
    ticketId: string,
    setTicketId: (id: string) => void,
    setCustomerId: (id: string) => void,
    setContractId: (id: string) => void,
    setProjectId: (id: string) => void
  ) {
    setTicketId(ticketId);
    if (!ticketId) {
      setCustomerId("");
      setContractId("");
      setProjectId("");
      return;
    }
    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket) return;
    setCustomerId(ticket.customerId);
    setContractId(
      ticket.contractId ||
        contracts.find((c) => c.customerId === ticket.customerId)?.id ||
        ""
    );
    setProjectId(
      ticket.projectId ||
        projects.find((p) => p.customerId === ticket.customerId)?.id ||
        ""
    );
  }

  function labelForCustomer(customerId: string) {
    return customers.find((c) => c.id === customerId)?.name ?? "";
  }

  function labelForContract(contractId: string) {
    return contracts.find((c) => c.id === contractId)?.label ?? "";
  }

  function labelForProject(projectId: string) {
    return projects.find((p) => p.id === projectId)?.label ?? "";
  }

  const selectedContract = contracts.find((c) => c.id === tContractId);
  const previewLaborCost = useMemo(() => laborCost(Number(hours) || 0, internalCostRate), [hours, internalCostRate]);
  const previewBillingRate = classification === "billable" ? selectedContract?.additionalHourlyRate ?? 0 : 0;

  const previewBillableAmount = useMemo(
    () => billableCost(Number(internalCost) || 0, Number(markupPct) || 0),
    [internalCost, markupPct]
  );

  async function submitTime(e: React.FormEvent) {
    e.preventDefault();
    setTimeError(null);
    setTimeMessage(null);

    const hoursNum = Number(hours);
    if (!tTicketId) {
      setTimeError("Please select a related ticket.");
      return;
    }
    if (!tCustomerId) {
      setTimeError("Selected ticket is missing a customer.");
      return;
    }
    if (!tContractId) {
      setTimeError("Selected ticket is missing a contract.");
      return;
    }
    if (!description.trim()) {
      setTimeError("Please describe the work performed.");
      return;
    }

    const hoursIssue = validateHoursWorked(hoursNum);
    if (hoursIssue) {
      setTimeError(hoursIssue.message);
      return;
    }

    setTimeLoading(true);
    const supabase = createClient();

    const { data: dayRows, error: dayError } = await supabase
      .from("time_entries")
      .select("hours_worked, support_ticket_id, project_id, description")
      .eq("technician_id", technicianId)
      .eq("work_date", workDate);

    if (dayError) {
      setTimeLoading(false);
      setTimeError(`Could not check daily hours: ${dayError.message}`);
      return;
    }

    const existingDailyHours = (dayRows ?? []).reduce(
      (sum, row) => sum + Number(row.hours_worked ?? 0),
      0
    );
    const dailyWarning = excessiveDailyHoursWarning(existingDailyHours, hoursNum, DAILY_HOUR_LIMIT);
    const unusualHours = Boolean(dailyWarning);
    if (dailyWarning) {
      const proceed = window.confirm(dailyWarning.message);
      if (!proceed) {
        setTimeLoading(false);
        return;
      }
    }

    const dupWarning = duplicateTimeEntryWarning(dayRows ?? [], {
      supportTicketId: tTicketId || null,
      projectId: tProjectId || null,
      hoursWorked: hoursNum,
    });
    if (dupWarning) {
      const proceed = window.confirm(dupWarning.message);
      if (!proceed) {
        setTimeLoading(false);
        return;
      }
    }

    // labor_cost is a generated column (hours_worked * internal_cost_rate) — do not insert it.
    const { error } = await supabase.from("time_entries").insert({
      technician_id: technicianId,
      customer_id: tCustomerId,
      contract_id: tContractId,
      support_ticket_id: tTicketId || null,
      project_id: tProjectId || null,
      work_date: workDate,
      hours_worked: hoursNum,
      work_category: workCategory || null,
      description: description.trim(),
      classification,
      internal_cost_rate: internalCostRate,
      billing_rate: previewBillingRate,
      unusual_hours_flag: unusualHours,
      approval_status: classification === "included" ? "not_required" : "pending",
    });
    setTimeLoading(false);
    if (error) {
      setTimeError(error.message);
      return;
    }
    setTimeMessage(
      unusualHours
        ? "Time entry saved and flagged for unusual daily hours."
        : "Time entry saved."
    );
    setHours("");
    setDescription("");
    setWorkCategory("");
    router.refresh();
  }

  async function submitCost(e: React.FormEvent) {
    e.preventDefault();
    setCostError(null);
    setCostMessage(null);

    const costNum = Number(internalCost);
    if (!cTicketId) {
      setCostError("Please select a related ticket.");
      return;
    }
    if (!cCustomerId) {
      setCostError("Selected ticket is missing a customer.");
      return;
    }
    const contractIssue = requireContract(cContractId);
    if (contractIssue) {
      setCostError(contractIssue.message);
      return;
    }
    if (!costDescription.trim()) {
      setCostError("Please describe this cost.");
      return;
    }
    if (Number.isNaN(costNum) || costNum < 0) {
      setCostError("Internal cost must be zero or greater.");
      return;
    }

    const largeCostWarning = largeCostRequiresApproval(costNum);
    const isLargeCost = requiresLargeCostApproval(costNum);
    if (largeCostWarning) {
      const proceed = window.confirm(largeCostWarning.message);
      if (!proceed) return;
    }

    const lateWarning = lateCostEntryWarning(costDate);
    const lateEntry = isLateCostEntry(costDate);
    if (lateWarning) {
      const proceed = window.confirm(lateWarning.message);
      if (!proceed) return;
    }

    setCostLoading(true);
    const supabase = createClient();

    // Technicians cannot read invoices via RLS; use a secure RPC existence check.
    const { data: priorInvoice, error: priorError } = await supabase.rpc("has_prior_invoice_for_cost", {
      p_contract_id: cContractId,
      p_customer_id: cCustomerId,
    });
    if (priorError) {
      setCostLoading(false);
      setCostError(`Could not check existing invoices: ${priorError.message}`);
      return;
    }

    const enteredAfterInvoice = Boolean(priorInvoice);
    if (enteredAfterInvoice) {
      const proceed = window.confirm(
        "An invoice already exists for this contract/customer. This cost will be flagged as Entered After Invoice. Existing invoices will not be changed, and the cost will stay available for the next invoice. Continue?"
      );
      if (!proceed) {
        setCostLoading(false);
        return;
      }
    }

    const needsManager = needsManagerCostReview({
      internalCost: costNum,
      lateEntry,
      enteredAfterInvoice,
    });

    const { error } = await supabase.from("direct_costs").insert({
      customer_id: cCustomerId,
      contract_id: cContractId,
      support_ticket_id: cTicketId || null,
      project_id: cProjectId || null,
      cost_category: costCategory,
      vendor: vendor || null,
      cost_date: costDate,
      internal_cost: costNum,
      markup_pct: Number(markupPct) || 0,
      billable_amount: billableCost(costNum, Number(markupPct) || 0),
      receipt_reference: receiptReference || null,
      description: costDescription.trim(),
      entered_by: technicianId,
      late_entry_flag: lateEntry,
      entered_after_invoice: enteredAfterInvoice,
      approval_threshold_required: isLargeCost,
      // Routine costs skip manager and are ready for billing; large/flagged need manager → billing.
      approval_status: needsManager ? "pending" : "approved",
      billing_status: "unbilled",
    });
    setCostLoading(false);
    if (error) {
      setCostError(error.message);
      return;
    }

    const flags: string[] = [];
    if (needsManager) {
      flags.push("pending manager approval, then billing");
    } else {
      flags.push("approved — ready to bill");
    }
    if (isLargeCost) flags.push("large cost");
    if (lateEntry) flags.push("late entry");
    if (enteredAfterInvoice) flags.push("entered after invoice");
    setCostMessage(`Direct cost saved (${flags.join("; ")}).`);
    setInternalCost("");
    setCostDescription("");
    setVendor("");
    setReceiptReference("");
    router.refresh();
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-sky-200/80 bg-gradient-to-b from-sky-50/70 to-base-100 shadow-sm">
      <div className="flex flex-wrap gap-2 border-b border-sky-200/70 px-3 py-2.5" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "time"}
          className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
            tab === "time"
              ? "bg-gradient-to-br from-sky-500 to-sky-600 text-white shadow-sm shadow-sky-500/20"
              : "border border-base-300 bg-white/80 opacity-80 hover:opacity-100"
          }`}
          onClick={() => setTab("time")}
        >
          Log Time
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "cost"}
          className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
            tab === "cost"
              ? "bg-gradient-to-br from-violet-500 to-violet-600 text-white shadow-sm shadow-violet-500/20"
              : "border border-base-300 bg-white/80 opacity-80 hover:opacity-100"
          }`}
          onClick={() => setTab("cost")}
        >
          Log Direct Cost
        </button>
      </div>

      <div className="p-4">
      {tab === "time" ? (
        <form className="space-y-3" onSubmit={submitTime}>
          {timeError ? <div className="alert alert-error text-sm">{timeError}</div> : null}
          {timeMessage ? <div className="alert alert-success text-sm">{timeMessage}</div> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex w-full flex-col gap-1 sm:col-span-2">
              <span className="text-sm font-medium">
                Related Ticket <span className="text-error">*</span>
              </span>
              <select
                className="select select-bordered w-full"
                value={tTicketId}
                onChange={(e) =>
                  applyTicketChoice(
                    e.target.value,
                    setTTicketId,
                    setTCustomerId,
                    setTContractId,
                    setTProjectId
                  )
                }
                required
              >
                <option value="">Select a ticket…</option>
                {tickets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <span className="text-xs opacity-60">
                Customer, contract, and project fill in automatically from the ticket.
              </span>
            </label>
            <div className="flex w-full flex-col gap-1">
              <span className="text-sm font-medium">Customer</span>
              <div className="input input-bordered flex h-12 w-full items-center bg-base-200/50 text-sm">
                {tCustomerId ? (
                  labelForCustomer(tCustomerId)
                ) : (
                  <span className="opacity-50">Select a ticket first</span>
                )}
              </div>
            </div>
            <div className="flex w-full flex-col gap-1">
              <span className="text-sm font-medium">Contract</span>
              <div className="input input-bordered flex h-12 w-full items-center bg-base-200/50 text-sm">
                {tContractId ? (
                  labelForContract(tContractId)
                ) : (
                  <span className="opacity-50">Select a ticket first</span>
                )}
              </div>
            </div>
            <div className="flex w-full flex-col gap-1 sm:col-span-2">
              <span className="text-sm font-medium">Related Project</span>
              <div className="input input-bordered flex h-12 w-full items-center bg-base-200/50 text-sm">
                {tProjectId ? (
                  labelForProject(tProjectId)
                ) : tTicketId ? (
                  <span className="opacity-50">No project linked to this ticket</span>
                ) : (
                  <span className="opacity-50">Select a ticket first</span>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex w-full flex-col gap-1">
              <span className="text-sm font-medium">Date</span>
              <input type="date" className="input input-bordered w-full" value={workDate} onChange={(e) => setWorkDate(e.target.value)} required />
            </label>
            <label className="flex w-full flex-col gap-1">
              <span className="text-sm font-medium">
                Hours Worked <span className="text-error">*</span>
              </span>
              <input
                type="number"
                min="0.25"
                step="0.25"
                className="input input-bordered w-full"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                required
              />
            </label>
            <label className="flex w-full flex-col gap-1">
              <span className="text-sm font-medium">Classification</span>
              <select
                className="select select-bordered w-full"
                value={classification}
                onChange={(e) => setClassification(e.target.value as typeof classification)}
              >
                <option value="included">Included (covered by contract)</option>
                <option value="billable">Billable (additional support)</option>
                <option value="out_of_scope">Out of Scope</option>
              </select>
            </label>
          </div>

          <label className="flex w-full flex-col gap-1">
            <span className="text-sm font-medium">Work Category (optional)</span>
            <input
              className="input input-bordered w-full"
              placeholder="e.g. Network, Server, Helpdesk"
              value={workCategory}
              onChange={(e) => setWorkCategory(e.target.value)}
            />
          </label>

          <label className="flex w-full flex-col gap-1">
            <span className="text-sm font-medium">Description</span>
            <textarea
              className="textarea textarea-bordered w-full"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </label>

          <div className="rounded-xl border border-sky-200/80 bg-white/80 p-3 text-sm shadow-sm">
            <div className="flex justify-between">
              <span className="opacity-70">Estimated labor cost (internal)</span>
              <span className="font-semibold tabular-nums text-sky-950">{formatCurrency(previewLaborCost)}</span>
            </div>
            {classification === "billable" ? (
              <div className="mt-1 flex justify-between">
                <span className="opacity-70">Billing rate applied</span>
                <span className="font-semibold tabular-nums">{formatCurrency(previewBillingRate)}/hr</span>
              </div>
            ) : null}
            {classification !== "included" ? (
              <p className="mt-2 text-xs opacity-60">This entry will be marked pending manager/billing approval.</p>
            ) : null}
          </div>

          <button
            className="rounded-xl border border-sky-400/50 bg-gradient-to-br from-sky-500 to-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-sky-500/25 transition hover:brightness-110 disabled:opacity-60"
            disabled={timeLoading}
          >
            {timeLoading ? "Saving…" : "Save Time Entry"}
          </button>
        </form>
      ) : (
        <form className="space-y-3" onSubmit={submitCost}>
          {costError ? <div className="alert alert-error text-sm">{costError}</div> : null}
          {costMessage ? <div className="alert alert-success text-sm">{costMessage}</div> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex w-full flex-col gap-1 sm:col-span-2">
              <span className="text-sm font-medium">
                Related Ticket <span className="text-error">*</span>
              </span>
              <select
                className="select select-bordered w-full"
                value={cTicketId}
                onChange={(e) =>
                  applyTicketChoice(
                    e.target.value,
                    setCTicketId,
                    setCCustomerId,
                    setCContractId,
                    setCProjectId
                  )
                }
                required
              >
                <option value="">Select a ticket…</option>
                {tickets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <span className="text-xs opacity-60">
                Customer, contract, and project fill in automatically from the ticket.
              </span>
            </label>
            <div className="flex w-full flex-col gap-1">
              <span className="text-sm font-medium">Customer</span>
              <div className="input input-bordered flex h-12 w-full items-center bg-base-200/50 text-sm">
                {cCustomerId ? (
                  labelForCustomer(cCustomerId)
                ) : (
                  <span className="opacity-50">Select a ticket first</span>
                )}
              </div>
            </div>
            <div className="flex w-full flex-col gap-1">
              <span className="text-sm font-medium">Contract</span>
              <div className="input input-bordered flex h-12 w-full items-center bg-base-200/50 text-sm">
                {cContractId ? (
                  labelForContract(cContractId)
                ) : (
                  <span className="opacity-50">Select a ticket first</span>
                )}
              </div>
            </div>
            <div className="flex w-full flex-col gap-1 sm:col-span-2">
              <span className="text-sm font-medium">Related Project</span>
              <div className="input input-bordered flex h-12 w-full items-center bg-base-200/50 text-sm">
                {cProjectId ? (
                  labelForProject(cProjectId)
                ) : cTicketId ? (
                  <span className="opacity-50">No project linked to this ticket</span>
                ) : (
                  <span className="opacity-50">Select a ticket first</span>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex w-full flex-col gap-1">
              <span className="text-sm font-medium">Category</span>
              <select
                className="select select-bordered w-full"
                value={costCategory}
                onChange={(e) => {
                  const cat = e.target.value as (typeof COST_CATEGORIES)[number];
                  setCostCategory(cat);
                  setMarkupPct(String(DEFAULT_MARKUP[cat] ?? 0));
                }}
              >
                {COST_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {COST_CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex w-full flex-col gap-1">
              <span className="text-sm font-medium">Vendor (optional)</span>
              <input className="input input-bordered w-full" value={vendor} onChange={(e) => setVendor(e.target.value)} />
            </label>
            <label className="flex w-full flex-col gap-1">
              <span className="text-sm font-medium">Date</span>
              <input type="date" className="input input-bordered w-full" value={costDate} onChange={(e) => setCostDate(e.target.value)} required />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex w-full flex-col gap-1">
              <span className="text-sm font-medium">Internal Cost ($)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input input-bordered w-full"
                value={internalCost}
                onChange={(e) => setInternalCost(e.target.value)}
                required
              />
            </label>
            <label className="flex w-full flex-col gap-1">
              <span className="text-sm font-medium">Markup % (e.g. 0.15 = 15%)</span>
              <input type="number" min="0" step="0.01" className="input input-bordered w-full" value={markupPct} onChange={(e) => setMarkupPct(e.target.value)} />
            </label>
          </div>

          <label className="flex w-full flex-col gap-1">
            <span className="text-sm font-medium">Receipt / Reference (optional)</span>
            <input className="input input-bordered w-full" value={receiptReference} onChange={(e) => setReceiptReference(e.target.value)} />
          </label>

          <label className="flex w-full flex-col gap-1">
            <span className="text-sm font-medium">Description</span>
            <textarea className="textarea textarea-bordered w-full" rows={3} value={costDescription} onChange={(e) => setCostDescription(e.target.value)} required />
          </label>

          <div className="rounded-xl border border-violet-200/80 bg-white/80 p-3 text-sm shadow-sm">
            <div className="flex justify-between">
              <span className="opacity-70">Billable amount to customer</span>
              <span className="font-semibold tabular-nums text-violet-950">{formatCurrency(previewBillableAmount)}</span>
            </div>
            <p className="mt-2 text-xs opacity-60">
              Routine costs are approved for billing automatically. Amounts at or above{" "}
              {formatCurrency(LARGE_COST_THRESHOLD)}, late entries, or costs entered after an invoice need manager
              review, then billing final approval. Receipt uploads are not required — a text reference is enough.
            </p>
          </div>

          <button
            className="rounded-xl border border-violet-400/50 bg-gradient-to-br from-violet-500 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-violet-500/25 transition hover:brightness-110 disabled:opacity-60"
            disabled={costLoading}
          >
            {costLoading ? "Saving…" : "Save Direct Cost"}
          </button>
        </form>
      )}
      </div>
    </div>
  );
}
