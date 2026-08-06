"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/Button";
import { canExportCustomers, type CustomerListRow } from "@/lib/customers/queries";
import { statusLabel } from "@/lib/format";
import type { UserRole } from "@/lib/constants";

type Props = {
  /** Currently displayed (search/filter-applied) customer rows. */
  rows: CustomerListRow[];
  role: UserRole;
};

function exportFilename(today = new Date()) {
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return `ServiceSync-Customers-${yyyy}-${mm}-${dd}.xlsx`;
}

/** Build a safe export row — never include database IDs, auth fields, or passwords. */
function toExportRow(row: CustomerListRow) {
  return {
    "Customer name": row.name?.trim() || "",
    Status: row.status ? statusLabel(row.status) : "",
    Industry: row.industry?.trim() || "",
    "Primary contact": row.primary_contact?.trim() || "",
    "Contact email": row.contact_email?.trim() || "",
  };
}

/**
 * Export the filtered customer list to Excel.
 * Permission is enforced in onExport — hiding the button alone is not enough.
 */
export function ExportCustomersButton({ rows, role }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const allowed = canExportCustomers(role);

  function onExport() {
    setMessage(null);
    setError(null);

    if (!canExportCustomers(role)) {
      setError(
        "Access denied. Only Admin, Manager, Executive, and Billing & Accounting can export the customer list."
      );
      return;
    }

    if (rows.length === 0) {
      setError("There are no customers to export for the current search and filters.");
      return;
    }

    try {
      const filename = exportFilename();
      const sheetData = rows.map(toExportRow);
      const worksheet = XLSX.utils.json_to_sheet(sheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Customers");
      XLSX.writeFile(workbook, filename);
      setMessage(`Exported ${rows.length} customer${rows.length === 1 ? "" : "s"} to ${filename}.`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Unknown error";
      setError(`Could not create the Excel file. ${detail}`);
    }
  }

  if (!allowed) {
    return (
      <div className="alert alert-warning text-sm py-2 max-w-xl" role="alert">
        Access denied for customer list export. Your role ({role}) cannot download the customer
        list. Only Admin, Manager, Executive, and Billing & Accounting may export.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="secondary" size="sm" onClick={onExport}>
        <Download className="h-4 w-4" />
        Export Customers
      </Button>
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
