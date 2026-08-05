"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { DataTable, EmptyState, Money, StatusBadge } from "@/components/ui";
import { BillingExceptionActions } from "@/components/BillingExceptionActions";
import { formatCurrency, formatHours } from "@/lib/format";

export type ReviewItemType = "recurring" | "time_entry" | "direct_cost" | "milestone" | "project";

export type ReviewItem = {
  type: ReviewItemType;
  id: string;
  customerId: string;
  customerName: string;
  contractId: string | null;
  contractName: string | null;
  categoryLabel: string;
  description: string;
  detail: string;
  amount: number;
};

export type ReviewException = {
  id: string;
  recordId: string;
  kind: "time_entry" | "direct_cost" | "additional_work";
  customerName: string;
  reason: string;
  detail: string;
  supportTicketId?: string | null;
};

export type MonthlyPackage = {
  contractId: string;
  periodStart?: string;
  contractName: string;
  customerId: string;
  customerName: string;
  alreadyInvoiced: boolean;
  monthlyFee: number;
  includedHours: number;
  includedHoursUsed: number;
  overageHours: number;
  overageRate: number;
  overageCharge: number;
  projectCharges: { id: string; name: string; amount: number }[];
  equipmentSoftwareCharges: { id: string; description: string; category: string; amount: number }[];
  estimatedTotal: number;
};

type ReviewTab = "monthly" | "other" | "exceptions";

function itemKey(item: ReviewItem) {
  return `${item.type}:${item.id}`;
}

function packageSelectKey(pkg: MonthlyPackage) {
  return pkg.periodStart ? `${pkg.contractId}:${pkg.periodStart}` : pkg.contractId;
}

export function BillingReviewClient({
  packages,
  items,
  exceptions,
  periodLabel,
  periodRange,
  canGenerateMonthly = true,
  billingPeriodStart,
}: {
  packages: MonthlyPackage[];
  items: ReviewItem[];
  exceptions: ReviewException[];
  periodLabel: string;
  periodRange: string;
  canGenerateMonthly?: boolean;
  billingPeriodStart?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<ReviewTab>("monthly");
  const [packageQuery, setPackageQuery] = useState("");
  const [expandedContractId, setExpandedContractId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedContracts, setSelectedContracts] = useState<Set<string>>(
    () => new Set(packages.filter((pkg) => !pkg.alreadyInvoiced && pkg.estimatedTotal > 0).map(packageSelectKey))
  );
  const [submittingCustomerId, setSubmittingCustomerId] = useState<string | null>(null);
  const [generatingMonthly, setGeneratingMonthly] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, { customerId: string; customerName: string; items: ReviewItem[] }>();
    for (const item of items) {
      const group = map.get(item.customerId) ?? {
        customerId: item.customerId,
        customerName: item.customerName,
        items: [] as ReviewItem[],
      };
      group.items.push(item);
      map.set(item.customerId, group);
    }
    return Array.from(map.values()).sort((a, b) => a.customerName.localeCompare(b.customerName));
  }, [items]);

  const filteredPackages = useMemo(() => {
    const q = packageQuery.trim().toLowerCase();
    if (!q) return packages;
    return packages.filter(
      (pkg) => pkg.customerName.toLowerCase().includes(q) || pkg.contractName.toLowerCase().includes(q)
    );
  }, [packages, packageQuery]);

  const selectableFiltered = filteredPackages.filter((pkg) => !pkg.alreadyInvoiced && pkg.estimatedTotal > 0);
  const allSelectableFilteredChecked =
    selectableFiltered.length > 0 &&
    selectableFiltered.every((pkg) => selectedContracts.has(packageSelectKey(pkg)));

  const packageTotal = packages
    .filter((pkg) => selectedContracts.has(packageSelectKey(pkg)))
    .reduce((sum, pkg) => sum + pkg.estimatedTotal, 0);

  function toggleContract(selectKey: string) {
    setSelectedContracts((prev) => {
      const next = new Set(prev);
      if (next.has(selectKey)) next.delete(selectKey);
      else next.add(selectKey);
      return next;
    });
  }

  function toggleFilteredContracts() {
    setSelectedContracts((prev) => {
      const next = new Set(prev);
      if (allSelectableFilteredChecked) {
        selectableFiltered.forEach((pkg) => next.delete(packageSelectKey(pkg)));
      } else {
        selectableFiltered.forEach((pkg) => next.add(packageSelectKey(pkg)));
      }
      return next;
    });
  }

  function toggleExpanded(selectKey: string) {
    setExpandedContractId((prev) => (prev === selectKey ? null : selectKey));
  }

  function toggle(item: ReviewItem) {
    const key = itemKey(item);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAll(groupItems: ReviewItem[]) {
    setSelected((prev) => {
      const next = new Set(prev);
      groupItems.forEach((item) => next.add(itemKey(item)));
      return next;
    });
  }

  function clearGroup(groupItems: ReviewItem[]) {
    setSelected((prev) => {
      const next = new Set(prev);
      groupItems.forEach((item) => next.delete(itemKey(item)));
      return next;
    });
  }

  async function generateMonthly() {
    const contractIds = Array.from(
      new Set(Array.from(selectedContracts).map((key) => key.split(":")[0]))
    );
    if (contractIds.length === 0) return;

    setGeneratingMonthly(true);
    setMessage(null);
    try {
      const res = await fetch("/api/invoices/generate-monthly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractIds, periodStart: billingPeriodStart }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: body.error ?? "Could not generate monthly invoices." });
        return;
      }
      const createdCount = body.created?.length ?? 0;
      const skipCount = body.skipped?.length ?? 0;
      const errorCount = body.errors?.length ?? 0;
      setMessage({
        type: errorCount ? "error" : "success",
        text: `Created ${createdCount} draft monthly invoice(s) for ${body.periodLabel}. Review each draft before sending. ${skipCount ? `${skipCount} skipped.` : ""} ${
          errorCount ? `${errorCount} error(s).` : ""
        }`.trim(),
      });
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Network error while generating monthly invoices." });
    } finally {
      setGeneratingMonthly(false);
    }
  }

  async function generateInvoice(group: { customerId: string; customerName: string; items: ReviewItem[] }) {
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
        text: `Invoice ${body.invoice.invoiceNumber} created for ${group.customerName} (${formatCurrency(
          body.invoice.totalAmount
        )}).`,
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

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-box border border-base-300 bg-base-100 p-4">
          <p className="text-xs uppercase tracking-wide opacity-60">Billing period</p>
          <p className="mt-1 text-lg font-semibold">{periodLabel}</p>
          <p className="text-xs opacity-60">{periodRange}</p>
        </div>
        <div className="rounded-box border border-base-300 bg-base-100 p-4">
          <p className="text-xs uppercase tracking-wide opacity-60">Monthly packages</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{packages.length}</p>
        </div>
        <div className="rounded-box border border-base-300 bg-base-100 p-4">
          <p className="text-xs uppercase tracking-wide opacity-60">Selected package total</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{formatCurrency(packageTotal)}</p>
        </div>
      </div>

      <div role="tablist" className="tabs tabs-box w-full max-w-xl">
        <button
          type="button"
          role="tab"
          className={`tab ${tab === "monthly" ? "tab-active" : ""}`}
          onClick={() => setTab("monthly")}
        >
          Monthly packages
          <span className="badge badge-sm ml-2">{packages.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          className={`tab ${tab === "other" ? "tab-active" : ""}`}
          onClick={() => setTab("other")}
        >
          Other charges
          <span className="badge badge-sm ml-2">{items.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          className={`tab ${tab === "exceptions" ? "tab-active" : ""}`}
          onClick={() => setTab("exceptions")}
        >
          Exceptions
          <span className={`badge badge-sm ml-2 ${exceptions.length > 0 ? "badge-warning" : ""}`}>
            {exceptions.length}
          </span>
        </button>
      </div>

      {tab === "monthly" ? (
        <section className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-md flex-1">
              <label className="form-control w-full">
                <span className="label-text mb-1 text-xs">Filter customer or contract</span>
                <input
                  type="search"
                  className="input input-bordered input-sm w-full"
                  placeholder="Search..."
                  value={packageQuery}
                  onChange={(e) => setPackageQuery(e.target.value)}
                />
              </label>
            </div>
            <div className="text-right">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!canGenerateMonthly || selectedContracts.size === 0 || generatingMonthly}
                onClick={generateMonthly}
                title={canGenerateMonthly ? undefined : "Switch to monthly view to generate invoices."}
              >
                {generatingMonthly ? "Generating..." : "Generate selected monthly invoices"}
              </button>
              {!canGenerateMonthly ? (
                <p className="mt-1 text-xs opacity-60">Switch to monthly view to generate invoices.</p>
              ) : null}
            </div>
          </div>

          <p className="text-sm opacity-70">
            Each package includes the monthly fee, included support hours used, calculated overage, approved project
            charges, and approved equipment or software charges. Expand a row for the full breakdown.
          </p>

          {packages.length === 0 ? (
            <EmptyState
              title="No monthly contract packages are ready"
              description="Active contracts with a monthly fee, hour usage, approved projects, or equipment/software charges will appear here."
            />
          ) : filteredPackages.length === 0 ? (
            <EmptyState title="No packages match this filter" description="Clear the search to see all monthly packages." />
          ) : (
            <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th className="w-10">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={allSelectableFilteredChecked}
                        onChange={toggleFilteredContracts}
                        aria-label="Select all filtered packages"
                        disabled={selectableFiltered.length === 0}
                      />
                    </th>
                    <th className="w-8" />
                    <th>Customer</th>
                    <th>Contract</th>
                    <th>Hours used</th>
                    <th>Overage $</th>
                    <th>Estimated total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPackages.map((pkg) => {
                    const selectKey = packageSelectKey(pkg);
                    const expanded = expandedContractId === selectKey;
                    return (
                      <Fragment key={selectKey}>
                        <tr className="hover">
                          <td>
                            <input
                              type="checkbox"
                              className="checkbox checkbox-sm"
                              checked={selectedContracts.has(selectKey)}
                              onChange={() => toggleContract(selectKey)}
                              disabled={pkg.alreadyInvoiced || pkg.estimatedTotal <= 0}
                              aria-label={`Select ${pkg.contractName}`}
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs btn-square"
                              aria-expanded={expanded}
                              aria-label={expanded ? "Collapse package details" : "Expand package details"}
                              onClick={() => toggleExpanded(selectKey)}
                            >
                              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          </td>
                          <td className="font-medium">{pkg.customerName}</td>
                          <td className="text-sm">{pkg.contractName}</td>
                          <td className="tabular-nums text-sm">
                            {formatHours(pkg.includedHoursUsed)} / {formatHours(pkg.includedHours)}
                          </td>
                          <td className="font-medium">
                            <Money value={pkg.overageCharge} />
                          </td>
                          <td className="font-semibold">
                            <Money value={pkg.estimatedTotal} />
                          </td>
                          <td>
                            {pkg.alreadyInvoiced ? (
                              <StatusBadge status="billed" />
                            ) : (
                              <span className="badge badge-ghost badge-sm">Ready</span>
                            )}
                          </td>
                        </tr>
                        {expanded ? (
                          <tr>
                            <td colSpan={8} className="bg-base-200/40 p-4">
                              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                                <div>
                                  <p className="text-xs opacity-60">Monthly contract charge</p>
                                  <p className="font-semibold">
                                    <Money value={pkg.alreadyInvoiced ? 0 : pkg.monthlyFee} />
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs opacity-60">Included hours used</p>
                                  <p className="font-semibold tabular-nums">
                                    {formatHours(pkg.includedHoursUsed)} / {formatHours(pkg.includedHours)}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs opacity-60">Overage hours</p>
                                  <p className="font-semibold tabular-nums">{formatHours(pkg.overageHours)}</p>
                                </div>
                                <div>
                                  <p className="text-xs opacity-60">Overage rate</p>
                                  <p className="font-semibold">
                                    <Money value={pkg.overageRate} />
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs opacity-60">Overage charges</p>
                                  <p className="font-semibold">
                                    <Money value={pkg.overageCharge} />
                                  </p>
                                </div>
                              </div>

                              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                                <div>
                                  <h3 className="mb-2 text-sm font-semibold">Approved project charges</h3>
                                  {pkg.projectCharges.length === 0 ? (
                                    <p className="text-sm opacity-60">None ready to bill.</p>
                                  ) : (
                                    <ul className="space-y-1 text-sm">
                                      {pkg.projectCharges.map((charge) => (
                                        <li key={charge.id} className="flex justify-between gap-3">
                                          <span>{charge.name}</span>
                                          <Money value={charge.amount} />
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                                <div>
                                  <h3 className="mb-2 text-sm font-semibold">Equipment and software charges</h3>
                                  {pkg.equipmentSoftwareCharges.length === 0 ? (
                                    <p className="text-sm opacity-60">None ready to bill.</p>
                                  ) : (
                                    <ul className="space-y-1 text-sm">
                                      {pkg.equipmentSoftwareCharges.map((charge) => (
                                        <li key={charge.id} className="flex justify-between gap-3">
                                          <span>
                                            <span className="capitalize">{charge.category}</span>: {charge.description}
                                          </span>
                                          <Money value={charge.amount} />
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === "other" ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Other approved charges</h2>
            <p className="text-sm opacity-70">
              Vendor, travel, and other reimbursable costs that are not part of the monthly contract package can still be
              invoiced separately.
            </p>
          </div>

          {groups.length === 0 ? (
            <EmptyState title="No other approved charges are waiting" />
          ) : (
            groups.map((group) => {
              const groupSelectedItems = group.items.filter((item) => selected.has(itemKey(item)));
              const total = groupSelectedItems.reduce((sum, item) => sum + item.amount, 0);
              const isSubmitting = submittingCustomerId === group.customerId;

              return (
                <div key={group.customerId} className="card border border-base-300 bg-base-100 shadow-sm">
                  <div className="card-body gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="card-title text-base">{group.customerName}</h3>
                        <p className="text-xs opacity-60">{group.items.length} eligible charge(s)</p>
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

                    <DataTable headers={["", "Charge type", "Description", "Detail", "Amount"]}>
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
                              <span className="badge badge-ghost badge-sm">{item.categoryLabel}</span>
                            </td>
                            <td className="max-w-xs">
                              <div className="font-medium">{item.description}</div>
                              {item.contractName ? <div className="text-xs opacity-60">{item.contractName}</div> : null}
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
                        {isSubmitting ? "Generating..." : "Generate Invoice"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </section>
      ) : null}

      {tab === "exceptions" ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Billing exceptions</h2>
            <p className="text-sm opacity-70">
              These items need attention and cannot be billed until they are approved or corrected.
            </p>
          </div>
          {exceptions.length === 0 ? (
            <EmptyState title="No billing exceptions" description="Unapproved or incomplete charges will show up here." />
          ) : (
            <DataTable headers={["Customer", "Reason", "Detail", "Status", ""]}>
              {exceptions.map((exception) => (
                <tr key={exception.id}>
                  <td>{exception.customerName}</td>
                  <td>{exception.reason}</td>
                  <td className="text-sm opacity-80">{exception.detail}</td>
                  <td>
                    <StatusBadge status="pending" />
                  </td>
                  <td className="text-right">
                    <BillingExceptionActions exception={exception} />
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
          <p className="text-sm">
            <Link href="/invoices" className="link link-primary">
              Review existing invoices
            </Link>
          </p>
        </section>
      ) : null}
    </div>
  );
}
