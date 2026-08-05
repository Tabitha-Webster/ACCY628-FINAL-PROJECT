"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { laborCost, billableCost } from "@/lib/calculations";
import { formatCurrency } from "@/lib/format";

type Option = { id: string; label: string; customerId: string };

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

const COST_CATEGORIES = ["software", "equipment", "vendor", "travel", "shipping", "other"] as const;
const DEFAULT_MARKUP: Record<string, number> = { software: 0.15, equipment: 0.2 };

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

  const contractsForCustomer = (customerId: string) => contracts.filter((c) => c.customerId === customerId);
  const ticketsForCustomer = (customerId: string) => tickets.filter((t) => t.customerId === customerId);
  const projectsForCustomer = (customerId: string) => projects.filter((p) => p.customerId === customerId);

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
    if (!tCustomerId) {
      setTimeError("Please select a customer.");
      return;
    }
    if (!description.trim()) {
      setTimeError("Please describe the work performed.");
      return;
    }
    if (!hoursNum || hoursNum <= 0) {
      setTimeError("Hours worked must be greater than 0.");
      return;
    }
    if (hoursNum > 12) {
      const proceed = window.confirm(`${hoursNum} hours is unusually high for a single entry. Continue anyway?`);
      if (!proceed) return;
    }

    setTimeLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from("time_entries").insert({
      technician_id: technicianId,
      customer_id: tCustomerId,
      contract_id: tContractId || null,
      support_ticket_id: tTicketId || null,
      project_id: tProjectId || null,
      work_date: workDate,
      hours_worked: hoursNum,
      work_category: workCategory || null,
      description: description.trim(),
      classification,
      internal_cost_rate: internalCostRate,
      billing_rate: previewBillingRate,
      labor_cost: laborCost(hoursNum, internalCostRate),
      approval_status: classification === "included" ? "not_required" : "pending",
    });
    setTimeLoading(false);
    if (error) {
      setTimeError(error.message);
      return;
    }
    setTimeMessage("Time entry saved.");
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
    if (!cCustomerId) {
      setCostError("Please select a customer.");
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
    if (costNum > 10000) {
      const proceed = window.confirm(`${formatCurrency(costNum)} is unusually high for a single cost entry. Continue anyway?`);
      if (!proceed) return;
    }

    setCostLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from("direct_costs").insert({
      customer_id: cCustomerId,
      contract_id: cContractId || null,
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
    });
    setCostLoading(false);
    if (error) {
      setCostError(error.message);
      return;
    }
    setCostMessage("Direct cost saved.");
    setInternalCost("");
    setCostDescription("");
    setVendor("");
    setReceiptReference("");
    router.refresh();
  }

  return (
    <div className="rounded-box border border-base-300 bg-base-100 p-4">
      <div role="tablist" className="tabs tabs-boxed mb-4 w-fit">
        <button type="button" role="tab" className={`tab ${tab === "time" ? "tab-active" : ""}`} onClick={() => setTab("time")}>
          Log Time
        </button>
        <button type="button" role="tab" className={`tab ${tab === "cost" ? "tab-active" : ""}`} onClick={() => setTab("cost")}>
          Log Direct Cost
        </button>
      </div>

      {tab === "time" ? (
        <form className="space-y-3" onSubmit={submitTime}>
          {timeError ? <div className="alert alert-error text-sm">{timeError}</div> : null}
          {timeMessage ? <div className="alert alert-success text-sm">{timeMessage}</div> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="form-control">
              <span className="label-text mb-1">Customer</span>
              <select
                className="select select-bordered"
                value={tCustomerId}
                onChange={(e) => {
                  setTCustomerId(e.target.value);
                  setTContractId("");
                  setTTicketId("");
                  setTProjectId("");
                }}
                required
              >
                <option value="">Select a customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-control">
              <span className="label-text mb-1">Contract (optional)</span>
              <select className="select select-bordered" value={tContractId} onChange={(e) => setTContractId(e.target.value)} disabled={!tCustomerId}>
                <option value="">None</option>
                {contractsForCustomer(tCustomerId).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-control">
              <span className="label-text mb-1">Related Ticket (optional)</span>
              <select className="select select-bordered" value={tTicketId} onChange={(e) => setTTicketId(e.target.value)} disabled={!tCustomerId}>
                <option value="">None</option>
                {ticketsForCustomer(tCustomerId).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-control">
              <span className="label-text mb-1">Related Project (optional)</span>
              <select className="select select-bordered" value={tProjectId} onChange={(e) => setTProjectId(e.target.value)} disabled={!tCustomerId}>
                <option value="">None</option>
                {projectsForCustomer(tCustomerId).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="form-control">
              <span className="label-text mb-1">Date</span>
              <input type="date" className="input input-bordered" value={workDate} onChange={(e) => setWorkDate(e.target.value)} required />
            </label>
            <label className="form-control">
              <span className="label-text mb-1">Hours Worked</span>
              <input
                type="number"
                min="0"
                step="0.25"
                className="input input-bordered"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                required
              />
            </label>
            <label className="form-control">
              <span className="label-text mb-1">Classification</span>
              <select
                className="select select-bordered"
                value={classification}
                onChange={(e) => setClassification(e.target.value as typeof classification)}
              >
                <option value="included">Included (covered by contract)</option>
                <option value="billable">Billable (additional support)</option>
                <option value="out_of_scope">Out of Scope</option>
              </select>
            </label>
          </div>

          <label className="form-control">
            <span className="label-text mb-1">Work Category (optional)</span>
            <input
              className="input input-bordered"
              placeholder="e.g. Network, Server, Helpdesk"
              value={workCategory}
              onChange={(e) => setWorkCategory(e.target.value)}
            />
          </label>

          <label className="form-control">
            <span className="label-text mb-1">Description</span>
            <textarea
              className="textarea textarea-bordered"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </label>

          <div className="rounded-box bg-base-200/60 p-3 text-sm">
            <div className="flex justify-between">
              <span className="opacity-70">Estimated labor cost (internal)</span>
              <span className="font-medium tabular-nums">{formatCurrency(previewLaborCost)}</span>
            </div>
            {classification === "billable" ? (
              <div className="mt-1 flex justify-between">
                <span className="opacity-70">Billing rate applied</span>
                <span className="font-medium tabular-nums">{formatCurrency(previewBillingRate)}/hr</span>
              </div>
            ) : null}
            {classification !== "included" ? (
              <p className="mt-2 text-xs opacity-60">This entry will be marked pending manager/billing approval.</p>
            ) : null}
          </div>

          <button className="btn btn-primary" disabled={timeLoading}>
            {timeLoading ? "Saving…" : "Save Time Entry"}
          </button>
        </form>
      ) : (
        <form className="space-y-3" onSubmit={submitCost}>
          {costError ? <div className="alert alert-error text-sm">{costError}</div> : null}
          {costMessage ? <div className="alert alert-success text-sm">{costMessage}</div> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="form-control">
              <span className="label-text mb-1">Customer</span>
              <select
                className="select select-bordered"
                value={cCustomerId}
                onChange={(e) => {
                  setCCustomerId(e.target.value);
                  setCContractId("");
                  setCTicketId("");
                  setCProjectId("");
                }}
                required
              >
                <option value="">Select a customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-control">
              <span className="label-text mb-1">Contract (optional)</span>
              <select className="select select-bordered" value={cContractId} onChange={(e) => setCContractId(e.target.value)} disabled={!cCustomerId}>
                <option value="">None</option>
                {contractsForCustomer(cCustomerId).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-control">
              <span className="label-text mb-1">Related Ticket (optional)</span>
              <select className="select select-bordered" value={cTicketId} onChange={(e) => setCTicketId(e.target.value)} disabled={!cCustomerId}>
                <option value="">None</option>
                {ticketsForCustomer(cCustomerId).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-control">
              <span className="label-text mb-1">Related Project (optional)</span>
              <select className="select select-bordered" value={cProjectId} onChange={(e) => setCProjectId(e.target.value)} disabled={!cCustomerId}>
                <option value="">None</option>
                {projectsForCustomer(cCustomerId).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="form-control">
              <span className="label-text mb-1">Category</span>
              <select
                className="select select-bordered"
                value={costCategory}
                onChange={(e) => {
                  const cat = e.target.value as (typeof COST_CATEGORIES)[number];
                  setCostCategory(cat);
                  setMarkupPct(String(DEFAULT_MARKUP[cat] ?? 0));
                }}
              >
                {COST_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-control">
              <span className="label-text mb-1">Vendor (optional)</span>
              <input className="input input-bordered" value={vendor} onChange={(e) => setVendor(e.target.value)} />
            </label>
            <label className="form-control">
              <span className="label-text mb-1">Date</span>
              <input type="date" className="input input-bordered" value={costDate} onChange={(e) => setCostDate(e.target.value)} required />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="form-control">
              <span className="label-text mb-1">Internal Cost ($)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input input-bordered"
                value={internalCost}
                onChange={(e) => setInternalCost(e.target.value)}
                required
              />
            </label>
            <label className="form-control">
              <span className="label-text mb-1">Markup % (e.g. 0.15 = 15%)</span>
              <input type="number" min="0" step="0.01" className="input input-bordered" value={markupPct} onChange={(e) => setMarkupPct(e.target.value)} />
            </label>
          </div>

          <label className="form-control">
            <span className="label-text mb-1">Receipt / Reference (optional)</span>
            <input className="input input-bordered" value={receiptReference} onChange={(e) => setReceiptReference(e.target.value)} />
          </label>

          <label className="form-control">
            <span className="label-text mb-1">Description</span>
            <textarea className="textarea textarea-bordered" rows={3} value={costDescription} onChange={(e) => setCostDescription(e.target.value)} required />
          </label>

          <div className="rounded-box bg-base-200/60 p-3 text-sm">
            <div className="flex justify-between">
              <span className="opacity-70">Billable amount to customer</span>
              <span className="font-medium tabular-nums">{formatCurrency(previewBillableAmount)}</span>
            </div>
            <p className="mt-2 text-xs opacity-60">This cost will be marked pending approval before it can be billed.</p>
          </div>

          <button className="btn btn-primary" disabled={costLoading}>
            {costLoading ? "Saving…" : "Save Direct Cost"}
          </button>
        </form>
      )}
    </div>
  );
}
