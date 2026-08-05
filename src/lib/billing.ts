import { hoursRemaining, usagePercentage, usageStatus } from "@/lib/calculations";
import { isTimeEntryAlreadyInvoiced } from "@/lib/billing-eligibility";

export type TimeHourRow = {
  hours_worked: number | string;
  classification: string;
  approval_status: string;
  billing_status?: string | null;
  invoice_id?: string | null;
  invoice_line_item_id?: string | null;
  billed_at?: string | null;
};

export type MonthlyUsage = {
  includedHours: number;
  includedHoursUsed: number;
  approvedBillableHours: number;
  unapprovedHours: number;
  hoursUsed: number;
  hoursRemaining: number;
  overageHours: number;
  usagePercent: number;
  usageStatus: "normal" | "warning" | "over_limit";
  additionalHourlyRate: number;
  overageCharge: number;
  monthlyFee: number;
};

export function billingPeriodFromStart(start: string) {
  const [year, month] = start.slice(0, 7).split("-").map(Number);
  const last = new Date(year, month, 0);
  const end = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
  const label = new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return { start: `${year}-${String(month).padStart(2, "0")}-01`, end, label };
}

export function currentBillingPeriod(now = new Date()) {
  return billingPeriodFromStart(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`);
}

export function computeMonthlyUsage(
  entries: TimeHourRow[],
  includedHours: number,
  additionalHourlyRate: number,
  monthlyFee: number
): MonthlyUsage {
  let includedHoursUsed = 0;
  let approvedBillableHours = 0;
  let unapprovedHours = 0;

  for (const entry of entries) {
    const hours = Number(entry.hours_worked ?? 0);
    if (!Number.isFinite(hours) || hours <= 0) continue;
    if (isTimeEntryAlreadyInvoiced(entry)) continue;

    if (entry.classification === "included") {
      includedHoursUsed += hours;
      continue;
    }

    if (
      ["billable", "out_of_scope"].includes(entry.classification) &&
      ["approved", "not_required"].includes(entry.approval_status)
    ) {
      approvedBillableHours += hours;
      continue;
    }

    if (["billable", "out_of_scope"].includes(entry.classification) && entry.approval_status === "pending") {
      unapprovedHours += hours;
    }
  }

  const hoursUsed = includedHoursUsed + approvedBillableHours;
  const overageHours =
    includedHours > 0 ? Math.max(0, hoursUsed - includedHours) : approvedBillableHours;
  const includedHoursConsumed = includedHours > 0 ? Math.min(hoursUsed, includedHours) : 0;
  const remaining = includedHours > 0 ? Math.max(0, hoursRemaining(includedHours, hoursUsed)) : 0;
  const pct = usagePercentage(hoursUsed, includedHours);

  return {
    includedHours,
    includedHoursUsed: round2(includedHoursConsumed),
    approvedBillableHours: round2(approvedBillableHours),
    unapprovedHours: round2(unapprovedHours),
    hoursUsed: round2(hoursUsed),
    hoursRemaining: round2(remaining),
    overageHours: round2(overageHours),
    usagePercent: round2(pct),
    usageStatus: usageStatus(pct),
    additionalHourlyRate,
    overageCharge: round2(overageHours * additionalHourlyRate),
    monthlyFee: round2(monthlyFee),
  };
}

export function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export const DEFAULT_SALES_TAX_RATE = 0.07;

export type InvoiceLineDraft = {
  description: string;
  quantity: number;
  rate: number;
  source_type: string;
  source_id: string;
  line_amount?: number;
};

export function makeInvoiceLine(draft: InvoiceLineDraft) {
  const quantity = round2(Number(draft.quantity ?? 0));
  const rate = round2(Number(draft.rate ?? 0));
  return {
    description: draft.description,
    quantity,
    rate,
    line_amount: round2(quantity * rate),
    source_type: draft.source_type,
    source_id: draft.source_id,
  };
}

export function invoiceSubtotal(lines: Array<{ line_amount?: number | string | null }>) {
  return round2(lines.reduce((sum, line) => sum + Number(line.line_amount ?? 0), 0));
}

export function isTaxExempt(taxStatus: string | null | undefined) {
  const value = (taxStatus ?? "taxable").trim().toLowerCase();
  return value.includes("exempt") || value === "nontaxable" || value === "non-taxable" || value === "no";
}

export function invoiceTaxAmount(
  subtotal: number,
  taxStatus: string | null | undefined = "taxable",
  taxRate = DEFAULT_SALES_TAX_RATE
) {
  if (subtotal <= 0 || isTaxExempt(taxStatus)) return 0;
  return round2(subtotal * taxRate);
}

export function invoiceTotal(subtotal: number, taxAmount: number, credits = 0) {
  return round2(Math.max(0, subtotal + taxAmount - Number(credits ?? 0)));
}

export function invoiceTotalsMatchLines(
  invoice: {
    subtotal?: number | string | null;
    tax_amount?: number | string | null;
    credits?: number | string | null;
    total_amount?: number | string | null;
  },
  lines: Array<{ line_amount?: number | string | null }>
) {
  const subtotal = round2(Number(invoice.subtotal ?? 0));
  const taxAmount = round2(Number(invoice.tax_amount ?? 0));
  const credits = round2(Number(invoice.credits ?? 0));
  const totalAmount = round2(Number(invoice.total_amount ?? 0));
  const lineSum = invoiceSubtotal(lines);
  return Math.abs(subtotal - lineSum) <= 0.01 && Math.abs(totalAmount - invoiceTotal(subtotal, taxAmount, credits)) <= 0.01;
}

export function invoiceTotalsMismatchReason(
  invoice: {
    subtotal?: number | string | null;
    tax_amount?: number | string | null;
    credits?: number | string | null;
    total_amount?: number | string | null;
  },
  lines: Array<{ line_amount?: number | string | null }>
) {
  if (invoiceTotalsMatchLines(invoice, lines)) return null;
  return "Invoice total must equal the sum of its lines.";
}

export function parsePaymentTermsDays(paymentTerms: string | null | undefined) {
  if (!paymentTerms) return 30;
  const match = paymentTerms.match(/(\d+)/);
  if (!match) return 30;
  const days = Number(match[1]);
  return Number.isFinite(days) && days > 0 ? days : 30;
}

export function addDays(dateStr: string, days: number) {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function invoiceDueDate(invoiceDate: string, paymentTerms?: string | null) {
  return addDays(invoiceDate, parsePaymentTermsDays(paymentTerms));
}

export function todayDateString(now = new Date()) {
  const local = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const year = local.getFullYear();
  const month = String(local.getMonth() + 1).padStart(2, "0");
  const day = String(local.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function deriveInvoiceStatus({
  currentStatus,
  dueDate,
  amountPaid,
  remainingBalance,
  disputed = false,
  today = todayDateString(),
}: {
  currentStatus?: string | null;
  dueDate: string;
  amountPaid: number;
  remainingBalance: number;
  disputed?: boolean;
  today?: string;
}) {
  if (currentStatus === "canceled") return "canceled";
  if (currentStatus === "draft") return "draft";
  if (disputed || currentStatus === "disputed") return "disputed";
  if (remainingBalance <= 0.01) return "paid";
  if (amountPaid > 0 && remainingBalance > 0.01) return "partially_paid";
  if (dueDate && dueDate < today && remainingBalance > 0.01) return "overdue";
  if (currentStatus === "sent") return "sent";
  return "issued";
}

export function withDerivedInvoiceStatus<
  T extends {
    status: string | null;
    due_date: string;
    amount_paid?: number | string | null;
    remaining_balance?: number | string | null;
    dispute_status?: string | null;
  },
>(invoice: T, today = todayDateString()) {
  const remainingBalance = Number(invoice.remaining_balance ?? 0);
  const amountPaid = Number(invoice.amount_paid ?? 0);
  return {
    ...invoice,
    remaining_balance: remainingBalance,
    amount_paid: amountPaid,
    status: deriveInvoiceStatus({
      currentStatus: invoice.status,
      dueDate: invoice.due_date,
      amountPaid,
      remainingBalance,
      disputed: Boolean(invoice.dispute_status) || invoice.status === "disputed",
      today,
    }),
  };
}

export function summarizeInvoice(
  lines: InvoiceLineDraft[],
  options?: {
    taxStatus?: string | null;
    taxRate?: number;
    credits?: number;
    invoiceDate?: string;
    paymentTerms?: string | null;
    currentStatus?: string | null;
    amountPaid?: number;
    disputed?: boolean;
  }
) {
  const builtLines = lines.map(makeInvoiceLine);
  const subtotal = invoiceSubtotal(builtLines);
  const taxRate = options?.taxRate ?? DEFAULT_SALES_TAX_RATE;
  const taxAmount = invoiceTaxAmount(subtotal, options?.taxStatus, taxRate);
  const credits = round2(Number(options?.credits ?? 0));
  const totalAmount = invoiceTotal(subtotal, taxAmount, credits);
  const invoiceDate = options?.invoiceDate ?? todayDateString();
  const dueDate = invoiceDueDate(invoiceDate, options?.paymentTerms);
  const amountPaid = round2(Number(options?.amountPaid ?? 0));
  const remaining = round2(Math.max(0, totalAmount - amountPaid));
  const status = deriveInvoiceStatus({
    currentStatus: options?.currentStatus ?? "issued",
    dueDate,
    amountPaid,
    remainingBalance: remaining,
    disputed: options?.disputed,
  });

  return {
    lines: builtLines,
    subtotal,
    taxRate,
    taxAmount,
    credits,
    totalAmount,
    invoiceDate,
    dueDate,
    amountPaid,
    remainingBalance: remaining,
    status,
    taxExempt: isTaxExempt(options?.taxStatus),
  };
}

export function lineSourceLabel(sourceType: string | null | undefined) {
  switch (sourceType) {
    case "recurring":
      return "Monthly contract charge";
    case "hours_included":
      return "Included support hours";
    case "overage":
      return "Overage hours";
    case "project":
      return "Project charge";
    case "milestone":
    case "project_milestone":
      return "Project milestone";
    case "direct_cost":
      return "Equipment / software / reimbursable";
    case "time_entry":
      return "Support time";
    default:
      return sourceType ? sourceType.replace(/_/g, " ") : "Other";
  }
}
