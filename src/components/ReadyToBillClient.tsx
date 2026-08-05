"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable, EmptyState, Money } from "@/components/ui";
import { formatCurrency } from "@/lib/format";

export type ReadyItem = {
  type: "time_entry" | "direct_cost" | "project";
  id: string;
  customerId: string;
  customerName: string;
  contractId: string | null;
  contractName: string | null;
  description: string;
  detail: string;
  amount: number;
  source?: "ticket" | "other";
  ticketNumber?: string | null;
};

export type MonthlyFeeInfo = {
  contractId: string;
  contractName: string;
  customerName: string;
  monthlyFee: number;
  periodAmount: number;
  billingFrequency: string | null;
  billingMethod: string | null;
  invoiceTerms: string | null;
  includedHours: number;
  overageRate: number;
  overageCharges: number;
  nextInvoiceDate: string | null;
  lastInvoiceDate: string | null;
  billingStatus: string | null;
  periodLabel: string;
};

const TYPE_LABEL: Record<ReadyItem["type"], string> = {
  time_entry: "Billable Time",
  direct_cost: "Direct Cost",
  project: "Project",
};

function itemKey(item: ReadyItem) {
  return `${item.type}:${item.id}`;
}

export function ReadyToBillClient({
  items,
  monthlyFees,
}: {
  items: ReadyItem[];
  monthlyFees: MonthlyFeeInfo[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submittingCustomerId, setSubmittingCustomerId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, { customerId: string; customerName: string; items: ReadyItem[] }>();
    for (const item of items) {
      const group = map.get(item.customerId) ?? {
        customerId: item.customerId,
        customerName: item.customerName,
        items: [] as ReadyItem[],
      };
      group.items.push(item);
      map.set(item.customerId, group);
    }
    return Array.from(map.values()).sort((a, b) => a.customerName.localeCompare(b.customerName));
  }, [items]);

  function toggle(item: ReadyItem) {
    const key = itemKey(item);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAll(groupItems: ReadyItem[]) {
    setSelected((prev) => {
      const next = new Set(prev);
      groupItems.forEach((item) => next.add(itemKey(item)));
      return next;
    });
  }

  function clearGroup(groupItems: ReadyItem[]) {
    setSelected((prev) => {
      const next = new Set(prev);
      groupItems.forEach((item) => next.delete(itemKey(item)));
      return next;
    });
  }

  async function generateInvoice(group: { customerId: string; customerName: string; items: ReadyItem[] }) {
    const chosen = group.items.filter((item) => selected.has(itemKey(item)));
    if (chosen.length === 0) return;

    setMessage(null);
    setSubmittingCustomerId(group.customerId);

    try {
      const res = await fetch("/api/invoices/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: group.customerId,
          items: chosen.map((item) => ({ type: item.type, id: item.id })),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        const detail = Array.isArray(body.conflicts) ? ` ${body.conflicts.join(" ")}` : "";
        setMessage({ type: "error", text: `${body.error ?? "Failed to generate invoice."}${detail}` });
        return;
      }
      setMessage({
        type: "success",
        text: `Draft invoice ${body.invoice.invoiceNumber} created for ${group.customerName} (${formatCurrency(
          body.invoice.totalAmount
        )}). Review it before sending.`,
      });
      clearGroup(group.items);
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Something went wrong generating the invoice. Please try again." });
    } finally {
      setSubmittingCustomerId(null);
    }
  }

  return (
    <div className="space-y-6">
      {message ? (
        <div className={`alert ${message.type === "success" ? "alert-success" : "alert-error"}`}>
          <span>{message.text}</span>
        </div>
      ) : null}

      {monthlyFees.length > 0 ? (
        <div className="rounded-box border border-base-300 bg-base-100 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
            Contract billing terms due {monthlyFees[0] ? `(${monthlyFees[0].periodLabel})` : ""}
          </h2>
          <p className="mt-1 text-xs opacity-60">
            Recurring and overage amounts from active contracts that are ready for contract-to-cash invoicing.
            Terms below are sourced from each agreement for future invoice generation.
          </p>
          <div className="mt-3 overflow-x-auto rounded-box border border-base-300">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Contract</th>
                  <th>Customer</th>
                  <th>MRR</th>
                  <th>Period amount</th>
                  <th>Frequency</th>
                  <th>Method</th>
                  <th>Terms</th>
                  <th>Included hrs</th>
                  <th>Overage rate</th>
                  <th>Overage $</th>
                  <th>Next invoice</th>
                  <th>Last invoice</th>
                  <th>Billing status</th>
                </tr>
              </thead>
              <tbody>
                {monthlyFees.map((fee) => (
                  <tr key={fee.contractId}>
                    <td>{fee.contractName}</td>
                    <td>{fee.customerName}</td>
                    <td>
                      <Money value={fee.monthlyFee} />
                    </td>
                    <td>
                      <Money value={fee.periodAmount} />
                    </td>
                    <td className="text-xs capitalize">
                      {(fee.billingFrequency ?? "—").replace(/_/g, " ")}
                    </td>
                    <td className="text-xs capitalize">
                      {(fee.billingMethod ?? "—").replace(/_/g, " ")}
                    </td>
                    <td className="text-xs">{fee.invoiceTerms ?? "—"}</td>
                    <td className="text-xs">{fee.includedHours.toFixed(1)}</td>
                    <td>
                      <Money value={fee.overageRate} />
                    </td>
                    <td>
                      <Money value={fee.overageCharges} />
                    </td>
                    <td className="text-xs whitespace-nowrap">{fee.nextInvoiceDate ?? "—"}</td>
                    <td className="text-xs whitespace-nowrap">{fee.lastInvoiceDate ?? "—"}</td>
                    <td className="text-xs capitalize">
                      {(fee.billingStatus ?? "—").replace(/_/g, " ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {groups.length === 0 ? (
        <EmptyState
          title="Nothing is ready to bill"
          description="Approved time, direct costs, and completed projects will appear here once they are ready for invoicing."
        />
      ) : null}

      {groups.map((group) => {
        const groupSelectedItems = group.items.filter((item) => selected.has(itemKey(item)));
        const total = groupSelectedItems.reduce((sum, item) => sum + item.amount, 0);
        const isSubmitting = submittingCustomerId === group.customerId;

        return (
          <div key={group.customerId} className="card border border-base-300 bg-base-100 shadow-sm">
            <div className="card-body gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="card-title text-base">{group.customerName}</h2>
                  <p className="text-xs opacity-60">{group.items.length} item(s) ready to bill</p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => selectAll(group.items)}>
                    Select all
                  </button>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => clearGroup(group.items)}>
                    Clear
                  </button>
                </div>
              </div>

              <DataTable headers={["", "Type", "Description", "Detail", "Amount"]}>
                {group.items.map((item) => {
                  const key = itemKey(item);
                  return (
                    <tr key={key}>
                      <td>
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm"
                          checked={selected.has(key)}
                          onChange={() => toggle(item)}
                        />
                      </td>
                      <td>
                        <div className="flex flex-col gap-1">
                          <span className="badge badge-ghost badge-sm">{TYPE_LABEL[item.type]}</span>
                          {item.source === "ticket" ? (
                            <span className="badge badge-info badge-sm">Ticket</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="max-w-xs">
                        <div className="font-medium">{item.description}</div>
                        {item.contractName ? <div className="text-xs opacity-60">{item.contractName}</div> : null}
                        {item.ticketNumber ? (
                          <div className="text-xs opacity-60">{item.ticketNumber}</div>
                        ) : null}
                      </td>
                      <td className="text-xs opacity-70">{item.detail}</td>
                      <td>
                        <Money value={item.amount} />
                      </td>
                    </tr>
                  );
                })}
              </DataTable>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-base-300 pt-3">
                <p className="text-sm">
                  <span className="opacity-60">{groupSelectedItems.length} selected · Total: </span>
                  <span className="font-semibold">{formatCurrency(total)}</span>
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={groupSelectedItems.length === 0 || isSubmitting}
                  onClick={() => generateInvoice(group)}
                >
                  {isSubmitting ? "Generating…" : "Generate Invoice"}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
