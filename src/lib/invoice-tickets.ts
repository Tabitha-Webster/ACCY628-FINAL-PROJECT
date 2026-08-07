import { computeMonthlyUsage, makeInvoiceLine, round2, summarizeInvoice } from "@/lib/billing";
import { billedHourlyRate, billedMonthlyRecurringFee } from "@/lib/contracts";
import { allocateNextDocumentNumber, loadNumberingSettings } from "@/lib/document-numbering";
import { createServiceClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export type InvoiceTicketRef = {
  id: string;
  ticket_number: string;
  title: string;
};

export type SlaSpeedOutcome = {
  outcome: "gain" | "loss" | "even" | "unknown";
  /** Positive = finished early (gain); negative = finished late (loss). */
  netHours: number | null;
  label: string;
};

/** Hours between SLA resolution target and actual completion (early = positive). */
export function slaResolutionHoursDelta(input: {
  targetResolutionAt: string | null | undefined;
  completedAt: string | null | undefined;
}): number | null {
  if (!input.targetResolutionAt || !input.completedAt) return null;
  const target = new Date(input.targetResolutionAt);
  const completed = new Date(input.completedAt);
  if (Number.isNaN(target.getTime()) || Number.isNaN(completed.getTime())) return null;
  return (target.getTime() - completed.getTime()) / (1000 * 60 * 60);
}

export function summarizeTicketSlaSpeed(
  tickets: Array<{
    target_resolution_at?: string | null;
    completed_at?: string | null;
  }>
): SlaSpeedOutcome {
  const deltas = tickets
    .map((t) =>
      slaResolutionHoursDelta({
        targetResolutionAt: t.target_resolution_at,
        completedAt: t.completed_at,
      })
    )
    .filter((v): v is number => v != null);

  if (deltas.length === 0) {
    return { outcome: "unknown", netHours: null, label: "—" };
  }

  const netHours = Math.round(deltas.reduce((sum, h) => sum + h, 0) * 10) / 10;
  if (Math.abs(netHours) < 0.05) {
    return { outcome: "even", netHours: 0, label: "Even · on SLA target" };
  }
  if (netHours > 0) {
    return {
      outcome: "gain",
      netHours,
      label: `Gain · ${netHours.toFixed(1)}h early`,
    };
  }
  return {
    outcome: "loss",
    netHours,
    label: `Loss · ${Math.abs(netHours).toFixed(1)}h late`,
  };
}

export async function linkTicketsToInvoice(
  supabase: SupabaseClient,
  invoiceId: string,
  ticketIds: Array<string | null | undefined>
) {
  const unique = Array.from(new Set(ticketIds.filter((id): id is string => Boolean(id))));
  if (unique.length === 0) return { error: null as string | null };
  const { error } = await supabase.from("invoice_tickets").upsert(
    unique.map((support_ticket_id) => ({ invoice_id: invoiceId, support_ticket_id })),
    { onConflict: "invoice_id,support_ticket_id", ignoreDuplicates: true }
  );
  return { error: error?.message ?? null };
}

/**
 * When a ticket is marked complete, create a draft invoice linked to that ticket
 * and pull in any still-unbilled time/cost rows for it.
 */
export async function createInvoiceForCompletedTicket(input: {
  ticketId: string;
  generatedBy: string;
}): Promise<{
  invoiceId: string | null;
  invoiceNumber: string | null;
  error: string | null;
  skipped?: string;
}> {
  const admin = createServiceClient();

  const { data: existingLink } = await admin
    .from("invoice_tickets")
    .select("invoice_id")
    .eq("support_ticket_id", input.ticketId)
    .limit(1)
    .maybeSingle();

  if (existingLink?.invoice_id) {
    const { data: inv } = await admin
      .from("invoices")
      .select("id, invoice_number, status")
      .eq("id", existingLink.invoice_id)
      .maybeSingle();
    if (inv && inv.status !== "canceled") {
      return {
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number,
        error: null,
        skipped: "Ticket already has a linked invoice.",
      };
    }
  }

  const { data: ticket, error: ticketError } = await admin
    .from("support_tickets")
    .select(
      "id, ticket_number, title, customer_id, contract_id, status, completed_at, target_resolution_at"
    )
    .eq("id", input.ticketId)
    .maybeSingle();

  if (ticketError) return { invoiceId: null, invoiceNumber: null, error: ticketError.message };
  if (!ticket) return { invoiceId: null, invoiceNumber: null, error: "Ticket not found." };
  if (!ticket.customer_id) {
    return { invoiceId: null, invoiceNumber: null, error: "Ticket has no customer." };
  }

  const [{ data: timeEntries }, { data: directCosts }] = await Promise.all([
    admin
      .from("time_entries")
      .select(
        "id, contract_id, work_date, hours_worked, billing_rate, description, classification, approval_status, billing_status"
      )
      .eq("support_ticket_id", input.ticketId)
      .or("billing_status.is.null,billing_status.eq.unbilled,billing_status.eq.ready"),
    admin
      .from("direct_costs")
      .select(
        "id, contract_id, cost_date, billable_amount, description, approval_status, billing_status"
      )
      .eq("support_ticket_id", input.ticketId)
      .or("billing_status.is.null,billing_status.eq.unbilled,billing_status.eq.ready"),
  ]);

  const billableTime = (timeEntries ?? []).filter(
    (row) =>
      row.classification !== "out_of_scope" &&
      (!row.approval_status || ["approved", "not_required"].includes(row.approval_status))
  );
  const billableCosts = (directCosts ?? []).filter(
    (row) => !row.approval_status || ["approved", "not_required"].includes(row.approval_status)
  );

  const drafts = [
    ...billableTime.map((entry) => ({
      ...makeInvoiceLine({
        description: `${ticket.ticket_number}: ${entry.description || ticket.title} (${Number(entry.hours_worked).toFixed(1)} hrs on ${entry.work_date})`,
        quantity: Number(entry.hours_worked ?? 0),
        rate: Number(entry.billing_rate ?? 0),
        source_type: "time_entry",
        source_id: entry.id,
      }),
      contract_id: entry.contract_id as string | null,
    })),
    ...billableCosts.map((cost) => ({
      ...makeInvoiceLine({
        description: `${ticket.ticket_number}: ${cost.description}`,
        quantity: 1,
        rate: Number(cost.billable_amount ?? 0),
        source_type: "direct_cost",
        source_id: cost.id,
      }),
      contract_id: cost.contract_id as string | null,
    })),
  ];

  // Always include a ticket completion marker line so every completed ticket gets an invoice.
  if (drafts.length === 0) {
    drafts.push({
      ...makeInvoiceLine({
        description: `Ticket ${ticket.ticket_number} completed — ${ticket.title} (covered / no billable lines yet)`,
        quantity: 1,
        rate: 0,
        source_type: "support_ticket",
        source_id: ticket.id,
      }),
      contract_id: ticket.contract_id,
    });
  }

  const contractId =
    ticket.contract_id ||
    drafts.map((d) => d.contract_id).find((id): id is string => Boolean(id)) ||
    null;

  let paymentTerms: string | null = null;
  let taxStatus: string | null = "taxable";
  if (contractId) {
    const { data: contract } = await admin
      .from("contracts")
      .select("payment_terms, tax_status")
      .eq("id", contractId)
      .maybeSingle();
    paymentTerms = contract?.payment_terms ?? null;
    taxStatus = contract?.tax_status ?? "taxable";
  }

  const { config } = await loadNumberingSettings();
  const taxRate = Math.max(0, Number(config.tax.defaultTaxRatePct) || 0) / 100;
  const totals = summarizeInvoice(drafts, {
    taxStatus,
    paymentTerms,
    currentStatus: "draft",
    taxRate,
  });

  const allocated = await allocateNextDocumentNumber("invoice");
  if (allocated.error || !allocated.number) {
    return {
      invoiceId: null,
      invoiceNumber: null,
      error: allocated.error || "Could not allocate invoice number.",
    };
  }

  const now = new Date();
  const billingPeriodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const billingPeriodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  const { data: invoice, error: invoiceError } = await admin
    .from("invoices")
    .insert({
      invoice_number: allocated.number,
      customer_id: ticket.customer_id,
      contract_id: contractId,
      invoice_date: totals.invoiceDate,
      due_date: totals.dueDate,
      status: "draft",
      billing_period_start: billingPeriodStart,
      billing_period_end: billingPeriodEnd,
      subtotal: totals.subtotal,
      tax_amount: totals.taxAmount,
      credits: totals.credits,
      total_amount: totals.totalAmount,
      amount_paid: 0,
      remaining_balance: totals.remainingBalance,
      notes: `Auto-created when ticket ${ticket.ticket_number} was completed.`,
      generated_by: input.generatedBy,
      generated_at: now.toISOString(),
    })
    .select("id, invoice_number")
    .single();

  if (invoiceError || !invoice) {
    return {
      invoiceId: null,
      invoiceNumber: null,
      error: invoiceError?.message ?? "Failed to create invoice.",
    };
  }

  const { data: lineItems, error: lineError } = await admin
    .from("invoice_line_items")
    .insert(
      totals.lines.map((d) => ({
        invoice_id: invoice.id,
        description: d.description,
        quantity: d.quantity,
        rate: d.rate,
        line_amount: d.line_amount,
        source_type: d.source_type,
        source_id: d.source_id,
      }))
    )
    .select("id, source_type, source_id");

  if (lineError) {
    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      error: `Invoice created but lines failed: ${lineError.message}`,
    };
  }

  await linkTicketsToInvoice(admin, invoice.id, [ticket.id]);

  const lineBySource = new Map(
    (lineItems ?? []).map((li) => [`${li.source_type}:${li.source_id}`, li.id])
  );

  for (const entry of billableTime) {
    const lineItemId = lineBySource.get(`time_entry:${entry.id}`) ?? null;
    await admin.rpc("mark_time_entry_billed", {
      p_entry_id: entry.id,
      p_invoice_id: invoice.id,
      p_line_item_id: lineItemId,
    });
  }
  for (const cost of billableCosts) {
    const lineItemId = lineBySource.get(`direct_cost:${cost.id}`) ?? null;
    await admin.rpc("mark_direct_cost_billed", {
      p_cost_id: cost.id,
      p_invoice_id: invoice.id,
      p_line_item_id: lineItemId,
    });
  }

  return { invoiceId: invoice.id, invoiceNumber: invoice.invoice_number, error: null };
}

export function contractAgreementFee(contract: {
  monthly_recurring_fee?: number | null;
  work_location?: string | null;
} | null): number | null {
  if (!contract) return null;
  return billedMonthlyRecurringFee(contract);
}

export type InvoiceLineForTotal = {
  source_type: string | null;
  source_id: string | null;
  line_amount: number | string | null;
  quantity?: number | string | null;
  rate?: number | string | null;
};

export type InvoiceTotalBreakdown = {
  monthlyRecurringFee: number;
  hourOverages: number;
  billableTime: number;
  directCosts: number;
  projects: number;
  invoiceTotal: number;
};

/**
 * Invoice Total for the billing list:
 * monthly fee (location-adjusted) + hour overages + billable time + direct costs + projects.
 */
export function computeInvoiceListTotal(input: {
  contract: {
    monthly_recurring_fee?: number | null;
    work_location?: string | null;
    included_hours_per_month?: number | null;
    additional_hourly_rate?: number | null;
  } | null;
  lines: InvoiceLineForTotal[];
  timeEntries: Array<{
    id: string;
    hours_worked: number | string | null;
    billing_rate: number | string | null;
    classification: string | null;
    approval_status?: string | null;
    billing_status?: string | null;
    invoice_id?: string | null;
    invoice_line_item_id?: string | null;
    billed_at?: string | null;
  }>;
  directCosts: Array<{
    id: string;
    billable_amount: number | string | null;
  }>;
  projects: Array<{
    id: string;
    fixed_fee: number | string | null;
    estimated_billing_amount: number | string | null;
  }>;
}): InvoiceTotalBreakdown {
  const lines = input.lines ?? [];
  const hasRecurring = lines.some((l) => l.source_type === "recurring");
  const hasOverageLine = lines.some((l) => l.source_type === "overage");

  const monthlyRecurringFee =
    hasRecurring && input.contract ? billedMonthlyRecurringFee(input.contract) : 0;

  let hourOverages = 0;
  if (hasOverageLine && input.contract) {
    // Recompute overages from time tied to this invoice (ignore already-billed skip).
    const usageRows = input.timeEntries.map((entry) => ({
      hours_worked: entry.hours_worked ?? 0,
      classification: entry.classification ?? "included",
      approval_status: entry.approval_status ?? "not_required",
      billing_status: "unbilled" as const,
      invoice_id: null,
      invoice_line_item_id: null,
      billed_at: null,
    }));
    const usage = computeMonthlyUsage(
      usageRows,
      Number(input.contract.included_hours_per_month ?? 0),
      billedHourlyRate(input.contract),
      billedMonthlyRecurringFee(input.contract)
    );
    hourOverages = usage.overageCharge;
    if (hourOverages <= 0) {
      hourOverages = round2(
        lines
          .filter((l) => l.source_type === "overage")
          .reduce((sum, l) => sum + Number(l.line_amount ?? 0), 0)
      );
    }
  } else if (hasOverageLine) {
    hourOverages = round2(
      lines
        .filter((l) => l.source_type === "overage")
        .reduce((sum, l) => sum + Number(l.line_amount ?? 0), 0)
    );
  }

  const timeById = new Map(input.timeEntries.map((e) => [e.id, e]));
  let billableTime = 0;
  for (const line of lines) {
    if (line.source_type !== "time_entry" || !line.source_id) continue;
    const entry = timeById.get(line.source_id);
    if (entry && entry.classification === "billable") {
      billableTime += round2(Number(entry.hours_worked ?? 0) * Number(entry.billing_rate ?? 0));
    } else if (!entry) {
      // Fallback to stored line when source row is missing.
      billableTime += Number(line.line_amount ?? 0);
    }
  }
  billableTime = round2(billableTime);

  const costById = new Map(input.directCosts.map((c) => [c.id, c]));
  let directCosts = 0;
  for (const line of lines) {
    if (line.source_type !== "direct_cost" || !line.source_id) continue;
    const cost = costById.get(line.source_id);
    directCosts += cost ? Number(cost.billable_amount ?? 0) : Number(line.line_amount ?? 0);
  }
  directCosts = round2(directCosts);

  const projectById = new Map(input.projects.map((p) => [p.id, p]));
  let projects = 0;
  for (const line of lines) {
    if (line.source_type !== "project" && line.source_type !== "milestone" && line.source_type !== "project_milestone") {
      continue;
    }
    if (line.source_type === "project" && line.source_id) {
      const project = projectById.get(line.source_id);
      if (project) {
        projects += Number(project.fixed_fee || project.estimated_billing_amount || 0);
        continue;
      }
    }
    projects += Number(line.line_amount ?? 0);
  }
  projects = round2(projects);

  const invoiceTotal = round2(
    monthlyRecurringFee + hourOverages + billableTime + directCosts + projects
  );

  return {
    monthlyRecurringFee,
    hourOverages,
    billableTime,
    directCosts,
    projects,
    invoiceTotal,
  };
}

export function invoiceGainLossVersusContractFee(
  invoiceTotal: number,
  contractFee: number | null
): {
  amount: number | null;
  outcome: "gain" | "loss" | "even" | "unknown";
  label: string;
} {
  if (contractFee == null || Math.abs(contractFee) < 0.005) {
    return { amount: null, outcome: "unknown", label: "—" };
  }
  const amount = round2(invoiceTotal - contractFee);
  if (Math.abs(amount) < 0.005) {
    return { amount: 0, outcome: "even", label: "Even · $0.00" };
  }
  if (amount > 0) {
    return {
      amount,
      outcome: "gain",
      label: `Gain · $${amount.toFixed(2)}`,
    };
  }
  return {
    amount,
    outcome: "loss",
    label: `Loss · $${Math.abs(amount).toFixed(2)}`,
  };
}
