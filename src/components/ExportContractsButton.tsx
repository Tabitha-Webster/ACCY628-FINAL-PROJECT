"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/Button";
import {
  CONTRACT_STATUS_LABELS,
  CONTRACT_TYPE_LABELS,
  WORK_LOCATION_LABELS,
  billedMonthlyRecurringFee,
  canExportContracts,
  getContractRenewalDate,
  isWorkLocation,
  unwrapAssignedManager,
  unwrapCustomer,
  type ContractListRow,
} from "@/lib/contracts";
import { statusLabel } from "@/lib/format";
import type { UserRole } from "@/lib/constants";

type Props = {
  /** Currently displayed (search/filter-applied) contract rows. */
  rows: ContractListRow[];
  role: UserRole;
};

function exportFilename(today = new Date()) {
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return `ServiceSync-Contracts-${yyyy}-${mm}-${dd}.xlsx`;
}

/** Build a safe export row — never include database IDs or auth fields. */
function toExportRow(row: ContractListRow) {
  const customer = unwrapCustomer(row);
  const manager = unwrapAssignedManager(row);
  const renewalDate = getContractRenewalDate(row);
  return {
    "Contract #": row.contract_number?.trim() || "",
    Customer: customer?.name?.trim() || "",
    "Contract name": row.name?.trim() || "",
    Status:
      CONTRACT_STATUS_LABELS[row.status as keyof typeof CONTRACT_STATUS_LABELS] ??
      statusLabel(row.status),
    Type:
      CONTRACT_TYPE_LABELS[row.contract_type as keyof typeof CONTRACT_TYPE_LABELS] ??
      statusLabel(String(row.contract_type)),
    "Start date": row.start_date || "",
    "End date": row.end_date || "",
    "Renewal type": row.renewal_type ? statusLabel(String(row.renewal_type)) : "",
    "Renewal date": renewalDate || "",
    "Work location": isWorkLocation(row.work_location)
      ? WORK_LOCATION_LABELS[row.work_location]
      : "",
    "Base MRR": row.monthly_recurring_fee ?? "",
    "Billed MRR": billedMonthlyRecurringFee(row),
    "Included hours / month": row.included_hours_per_month ?? "",
    "Payment terms": row.payment_terms?.trim() || "",
    "Billing frequency": row.billing_frequency
      ? statusLabel(String(row.billing_frequency))
      : "",
    "Account manager": manager?.full_name?.trim() || "",
  };
}

/**
 * Export the filtered contracts list to Excel.
 * Permission is enforced in onExport — hiding the button alone is not enough.
 */
export function ExportContractsButton({ rows, role }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const allowed = canExportContracts(role);

  function onExport() {
    setMessage(null);
    setError(null);

    if (!canExportContracts(role)) {
      setError(
        "Access denied. Only Admin, Manager, and Billing can export the contracts list."
      );
      return;
    }

    if (rows.length === 0) {
      setError("There are no contracts to export for the current search and filters.");
      return;
    }

    try {
      const filename = exportFilename();
      const sheetData = rows.map(toExportRow);
      const worksheet = XLSX.utils.json_to_sheet(sheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Contracts");
      XLSX.writeFile(workbook, filename);
      setMessage(`Exported ${rows.length} contract${rows.length === 1 ? "" : "s"} to ${filename}.`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Unknown error";
      setError(`Could not create the Excel file. ${detail}`);
    }
  }

  if (!allowed) return null;

  const tip =
    rows.length === 0
      ? "Export downloads an Excel (.xlsx) file of the contracts currently shown. Apply search or filters first — there is nothing to export right now."
      : `Download an Excel (.xlsx) file of the ${rows.length} contract${rows.length === 1 ? "" : "s"} currently shown (matching your search and filters), including contract #, customer, status, dates, MRR, and account manager.`;

  return (
    <div className="space-y-2">
      <div className="tooltip tooltip-left before:max-w-xs before:text-left" data-tip={tip}>
        <Button type="button" variant="secondary" size="sm" onClick={onExport}>
          <Download className="h-4 w-4" />
          Export Contracts
        </Button>
      </div>
      {error ? (
        <div className="alert alert-error text-sm py-2 max-w-xl" role="alert">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="alert alert-success text-sm py-2 max-w-xl" role="status">
          {message}
        </div>
      ) : null}
    </div>
  );
}
