import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { invoiceTotalsMismatchReason, makeInvoiceLine, summarizeInvoice } from "@/lib/billing";
import {
  ONE_TIME_BILLING_SOURCES,
  directCostBillingBlockReason,
  hasDuplicateIds,
  milestoneBillingBlockReason,
  projectBillingBlockReason,
  timeEntryBillingBlockReason,
} from "@/lib/billing-eligibility";

type RequestedItem = {
  type: "time_entry" | "direct_cost" | "project" | "milestone" | "recurring";
  id: string;
};

function generateInvoiceNumber(): string {
  const today = new Date();
  const stamp = today.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `INV-${stamp}-${suffix}`;
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }
  if (!["manager", "billing"].includes(profile.role)) {
    return NextResponse.json({ error: "Only billing and manager roles can generate invoices." }, { status: 403 });
  }

  let body: { customerId?: string; items?: RequestedItem[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const customerId = body.customerId;
  const items = body.items;

  if (!customerId || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Select at least one item to bill." }, { status: 400 });
  }

  const timeEntryIds = items.filter((i) => i.type === "time_entry").map((i) => i.id);
  const directCostIds = items.filter((i) => i.type === "direct_cost").map((i) => i.id);
  const projectIds = items.filter((i) => i.type === "project").map((i) => i.id);
  const milestoneIds = items.filter((i) => i.type === "milestone").map((i) => i.id);
  const recurringIds = items.filter((i) => i.type === "recurring").map((i) => i.id);

  const supabase = await createClient();

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, name")
    .eq("id", customerId)
    .maybeSingle();

  if (customerError) {
    return NextResponse.json({ error: customerError.message }, { status: 500 });
  }
  if (!customer) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  const now = new Date();
  const billingPeriodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const billingPeriodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  const [timeEntriesRes, directCostsRes, projectsRes, milestonesRes, contractsRes] = await Promise.all([
    timeEntryIds.length > 0
      ? supabase
          .from("time_entries")
          .select(
            "id, customer_id, contract_id, support_ticket_id, technician_id, work_date, hours_worked, billing_rate, description, classification, approval_status, billing_status, invoice_id, invoice_line_item_id, billed_at"
          )
          .in("id", timeEntryIds)
      : Promise.resolve({ data: [], error: null }),
    directCostIds.length > 0
      ? supabase
          .from("direct_costs")
          .select(
            "id, customer_id, contract_id, support_ticket_id, entered_by, cost_category, cost_date, billable_amount, description, approval_status, billing_status, invoice_id, invoice_line_item_id, billed_at"
          )
          .in("id", directCostIds)
      : Promise.resolve({ data: [], error: null }),
    projectIds.length > 0
      ? supabase
          .from("projects")
          .select("id, customer_id, contract_id, name, fixed_fee, estimated_billing_amount, status, billing_status, amount_billed, customer_approval_status")
          .in("id", projectIds)
      : Promise.resolve({ data: [], error: null }),
    milestoneIds.length > 0
      ? supabase
          .from("project_milestones")
          .select("id, name, amount, completed, approval_status, billing_status, project_id, projects(id, customer_id, contract_id, name)")
          .in("id", milestoneIds)
      : Promise.resolve({ data: [], error: null }),
    recurringIds.length > 0
      ? supabase
          .from("contracts")
          .select("id, customer_id, name, status, monthly_recurring_fee, billing_timing, payment_terms")
          .in("id", recurringIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (timeEntriesRes.error) return NextResponse.json({ error: timeEntriesRes.error.message }, { status: 500 });
  if (directCostsRes.error) return NextResponse.json({ error: directCostsRes.error.message }, { status: 500 });
  if (projectsRes.error) return NextResponse.json({ error: projectsRes.error.message }, { status: 500 });
  if (milestonesRes.error) return NextResponse.json({ error: milestonesRes.error.message }, { status: 500 });
  if (contractsRes.error) return NextResponse.json({ error: contractsRes.error.message }, { status: 500 });

  const timeEntries = timeEntriesRes.data ?? [];
  const directCosts = directCostsRes.data ?? [];
  const projects = projectsRes.data ?? [];
  const milestones = milestonesRes.data ?? [];
  const recurringContracts = contractsRes.data ?? [];

  const conflicts: string[] = [];

  if (hasDuplicateIds(timeEntryIds)) conflicts.push("The same time entry was selected more than once.");
  if (hasDuplicateIds(directCostIds)) conflicts.push("The same direct cost was selected more than once.");
  if (hasDuplicateIds(projectIds)) conflicts.push("The same project was selected more than once.");
  if (hasDuplicateIds(milestoneIds)) conflicts.push("The same milestone was selected more than once.");
  if (timeEntries.length !== timeEntryIds.length) conflicts.push("One or more time entries could not be found.");
  if (directCosts.length !== directCostIds.length) conflicts.push("One or more direct costs could not be found.");
  if (projects.length !== projectIds.length) conflicts.push("One or more projects could not be found.");
  if (milestones.length !== milestoneIds.length) conflicts.push("One or more milestones could not be found.");
  if (recurringContracts.length !== recurringIds.length) conflicts.push("One or more recurring fees could not be found.");

  const relatedContractIds = Array.from(
    new Set(
      [
        ...timeEntries.map((e) => e.contract_id),
        ...directCosts.map((c) => c.contract_id),
        ...projects.map((p) => p.contract_id),
        ...milestones.map((m) => {
          const project = Array.isArray(m.projects) ? m.projects[0] : m.projects;
          return project?.contract_id ?? null;
        }),
      ].filter((id): id is string => Boolean(id))
    )
  );

  if (relatedContractIds.length > 0) {
    const { data: relatedContracts, error: relatedContractsError } = await supabase
      .from("contracts")
      .select("id, name, status")
      .in("id", relatedContractIds);
    if (relatedContractsError) {
      return NextResponse.json({ error: relatedContractsError.message }, { status: 500 });
    }
    const byId = new Map((relatedContracts ?? []).map((c) => [c.id, c]));
    for (const contractId of relatedContractIds) {
      const contract = byId.get(contractId);
      if (!contract) {
        conflicts.push("A selected item references a missing contract.");
        continue;
      }
      if (contract.status !== "active") {
        conflicts.push(
          `Cannot bill against contract "${contract.name}" because it is not active (${contract.status}).`
        );
      }
    }
  }

  for (const entry of timeEntries) {
    if (!entry.contract_id) conflicts.push(`Time entry on ${entry.work_date} has no active contract link.`);
    if (entry.customer_id !== customerId) conflicts.push(`Time entry ${entry.id} belongs to a different customer.`);
    const reason = timeEntryBillingBlockReason(entry);
    if (reason) conflicts.push(reason);
    if (entry.support_ticket_id) {
      const { data: eligible, error: eligError } = await supabase.rpc("time_entry_ticket_billing_eligible", {
        p_entry_id: entry.id,
      });
      if (eligError) conflicts.push(`Could not verify ticket billing eligibility for ${entry.work_date}: ${eligError.message}`);
      else if (!eligible)
        conflicts.push(
          `Time entry on ${entry.work_date} is linked to a ticket but is not eligible to bill (incomplete ticket, missing notes, unapproved OOS, inactive/invalid contract, or missing links).`
        );
    }
  }
  for (const cost of directCosts) {
    if (!cost.contract_id) conflicts.push(`Direct cost "${cost.description}" has no active contract link.`);
    if (cost.customer_id !== customerId) conflicts.push(`Direct cost ${cost.id} belongs to a different customer.`);
    const reason = directCostBillingBlockReason(cost);
    if (reason) conflicts.push(reason);
    if (cost.invoice_id || cost.invoice_line_item_id || cost.billed_at)
      conflicts.push(`Direct cost "${cost.description}" has already been billed.`);
    if (cost.support_ticket_id) {
      const { data: eligible, error: eligError } = await supabase.rpc("direct_cost_ticket_billing_eligible", {
        p_cost_id: cost.id,
      });
      if (eligError) conflicts.push(`Could not verify ticket cost eligibility: ${eligError.message}`);
      else if (!eligible) conflicts.push(`Direct cost "${cost.description}" is linked to a ticket but is not eligible to bill.`);
    }
  }
  for (const project of projects) {
    if (!project.contract_id) conflicts.push(`Project "${project.name}" has no active contract link.`);
    if (project.customer_id !== customerId) conflicts.push(`Project ${project.id} belongs to a different customer.`);
    const reason = projectBillingBlockReason(project);
    if (reason) conflicts.push(reason);
  }
  for (const milestone of milestones) {
    const project = Array.isArray(milestone.projects) ? milestone.projects[0] : milestone.projects;
    if (!project || project.customer_id !== customerId)
      conflicts.push(`Milestone "${milestone.name}" belongs to a different customer.`);
    if (!project?.contract_id) conflicts.push(`Milestone "${milestone.name}" has no active contract link.`);
    const reason = milestoneBillingBlockReason(milestone);
    if (reason) conflicts.push(reason);
  }
  for (const contract of recurringContracts) {
    if (contract.customer_id !== customerId) conflicts.push(`Contract "${contract.name}" belongs to a different customer.`);
    if (contract.status !== "active") conflicts.push(`Contract "${contract.name}" is not active.`);
    if (Number(contract.monthly_recurring_fee ?? 0) <= 0)
      conflicts.push(`Contract "${contract.name}" has no monthly fee to bill.`);
  }

  const oneTimeSources = [
    ...timeEntryIds.map((id) => ({ type: "time_entry", id })),
    ...directCostIds.map((id) => ({ type: "direct_cost", id })),
    ...projectIds.map((id) => ({ type: "project", id })),
    ...milestoneIds.map((id) => ({ type: "milestone", id })),
  ];
  if (oneTimeSources.length > 0) {
    const { data: existingSourceLines } = await supabase
      .from("invoice_line_items")
      .select("source_type, source_id, invoices(status)")
      .in("source_type", [...ONE_TIME_BILLING_SOURCES])
      .in(
        "source_id",
        oneTimeSources.map((source) => source.id)
      );
    for (const line of existingSourceLines ?? []) {
      const invoice = Array.isArray(line.invoices) ? line.invoices[0] : line.invoices;
      if (invoice && invoice.status !== "canceled") {
        conflicts.push(
          line.source_type === "time_entry"
            ? "A selected time entry is already on another invoice and cannot be billed again."
            : "One or more selected time or cost items were already billed on another invoice."
        );
        break;
      }
    }
  }

  if (recurringIds.length > 0) {
    const { data: existingRecurringLines } = await supabase
      .from("invoice_line_items")
      .select("source_id, invoice_id")
      .eq("source_type", "recurring")
      .in("source_id", recurringIds);
    const invoiceIds = Array.from(new Set((existingRecurringLines ?? []).map((row) => row.invoice_id)));
    if (invoiceIds.length > 0) {
      const { data: existingInvoices } = await supabase
        .from("invoices")
        .select("id, status, billing_period_start")
        .in("id", invoiceIds);
      const billedThisPeriod = new Set(
        (existingInvoices ?? [])
          .filter((inv) => inv.status !== "canceled" && inv.billing_period_start === billingPeriodStart)
          .map((inv) => inv.id)
      );
      for (const line of existingRecurringLines ?? []) {
        if (billedThisPeriod.has(line.invoice_id)) {
          conflicts.push("That monthly support fee was already billed for this period.");
        }
      }
    }
  }

  if (conflicts.length > 0) {
    return NextResponse.json({ error: "Some selected items cannot be billed.", conflicts }, { status: 409 });
  }

  const drafts: Array<ReturnType<typeof makeInvoiceLine> & { contract_id: string | null }> = [];

  for (const entry of timeEntries) {
    const rate = Number(entry.billing_rate ?? 0);
    const hours = Number(entry.hours_worked ?? 0);
    drafts.push({
      ...makeInvoiceLine({
        description: `${entry.description} (${hours.toFixed(1)} hrs on ${entry.work_date})`,
        quantity: hours,
        rate,
        source_type: "time_entry",
        source_id: entry.id,
      }),
      contract_id: entry.contract_id,
    });
  }
  for (const cost of directCosts) {
    const amount = Number(cost.billable_amount ?? 0);
    drafts.push({
      ...makeInvoiceLine({
        description: `${cost.description}`,
        quantity: 1,
        rate: amount,
        source_type: "direct_cost",
        source_id: cost.id,
      }),
      contract_id: cost.contract_id,
    });
  }
  for (const project of projects) {
    const amount = Number(project.fixed_fee || project.estimated_billing_amount || 0);
    drafts.push({
      ...makeInvoiceLine({
        description: `Project: ${project.name}`,
        quantity: 1,
        rate: amount,
        source_type: "project",
        source_id: project.id,
      }),
      contract_id: project.contract_id,
    });
  }
  for (const milestone of milestones) {
    const project = Array.isArray(milestone.projects) ? milestone.projects[0] : milestone.projects;
    const amount = Number(milestone.amount ?? 0);
    drafts.push({
      ...makeInvoiceLine({
        description: `Milestone: ${project?.name ?? "Project"} — ${milestone.name}`,
        quantity: 1,
        rate: amount,
        source_type: "milestone",
        source_id: milestone.id,
      }),
      contract_id: project?.contract_id ?? null,
    });
  }
  for (const contract of recurringContracts) {
    const amount = Number(contract.monthly_recurring_fee ?? 0);
    drafts.push({
      ...makeInvoiceLine({
        description: `${contract.name} monthly support fee (${billingPeriodStart} to ${billingPeriodEnd})`,
        quantity: 1,
        rate: amount,
        source_type: "recurring",
        source_id: contract.id,
      }),
      contract_id: contract.id,
    });
  }

  const distinctContractIds = Array.from(new Set(drafts.map((d) => d.contract_id).filter((c): c is string => !!c)));
  const contractId = distinctContractIds.length === 1 ? distinctContractIds[0] : null;

  let paymentTerms: string | null = null;
  let taxStatus: string | null = "taxable";
  if (contractId) {
    const { data: contract } = await supabase
      .from("contracts")
      .select(
        "payment_terms, tax_status, billing_frequency, billing_method, billing_timing, monthly_recurring_fee, included_hours_per_month, additional_hourly_rate, overages_allowed, overage_charges, next_invoice_date, last_invoice_date, billing_status"
      )
      .eq("id", contractId)
      .maybeSingle();
    paymentTerms = contract?.payment_terms ?? null;
    taxStatus = contract?.tax_status ?? "taxable";
  }

  const totals = summarizeInvoice(drafts, {
    taxStatus,
    paymentTerms,
    currentStatus: "draft",
  });

  if (totals.subtotal <= 0) {
    return NextResponse.json({ error: "An invoice must have a positive total." }, { status: 400 });
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      invoice_number: generateInvoiceNumber(),
      customer_id: customerId,
      contract_id: contractId,
      invoice_date: totals.invoiceDate,
      due_date: totals.dueDate,
      status: totals.status,
      billing_period_start: billingPeriodStart,
      billing_period_end: billingPeriodEnd,
      subtotal: totals.subtotal,
      tax_amount: totals.taxAmount,
      credits: totals.credits,
      total_amount: totals.totalAmount,
      amount_paid: 0,
      remaining_balance: totals.remainingBalance,
      generated_by: profile.id,
      generated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (invoiceError || !invoice) {
    return NextResponse.json({ error: invoiceError?.message ?? "Failed to create invoice." }, { status: 500 });
  }

  const { data: lineItems, error: lineItemsError } = await supabase
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
    .select();

  if (lineItemsError || !lineItems) {
    const duplicateTimeEntry =
      /already been invoiced|invoice_line_items_unique_source|duplicate key/i.test(lineItemsError?.message ?? "");
    const unapproved = /unapproved/i.test(lineItemsError?.message ?? "");
    return NextResponse.json(
      {
        error: duplicateTimeEntry
          ? "A selected time entry is already invoiced and cannot be billed again."
          : unapproved
            ? "Unapproved changes cannot be billed."
            : (lineItemsError?.message ?? "Invoice created, but line items failed to save."),
      },
      { status: 400 }
    );
  }

  const totalsMismatch = invoiceTotalsMismatchReason(invoice, lineItems);
  if (totalsMismatch) {
    return NextResponse.json({ error: totalsMismatch }, { status: 500 });
  }

  const lineItemBySource = new Map<string, string>(lineItems.map((li) => [`${li.source_type}:${li.source_id}`, li.id]));
  const updateErrors: string[] = [];

  for (const entry of timeEntries) {
    const lineItemId = lineItemBySource.get(`time_entry:${entry.id}`) ?? null;
    const { error } = await supabase.rpc("mark_time_entry_billed", {
      p_entry_id: entry.id,
      p_invoice_id: invoice.id,
      p_line_item_id: lineItemId,
    });
    if (error) updateErrors.push(error.message);
  }
  for (const cost of directCosts) {
    const lineItemId = lineItemBySource.get(`direct_cost:${cost.id}`) ?? null;
    const { error } = await supabase.rpc("mark_direct_cost_billed", {
      p_cost_id: cost.id,
      p_invoice_id: invoice.id,
      p_line_item_id: lineItemId,
    });
    if (error) updateErrors.push(error.message);
  }
  for (const project of projects) {
    const draft = drafts.find((d) => d.source_type === "project" && d.source_id === project.id);
    const { data: updated, error } = await supabase
      .from("projects")
      .update({
        billing_status: "billed",
        status: "billed",
        amount_billed: Number(project.amount_billed ?? 0) + Number(draft?.line_amount ?? 0),
      })
      .eq("id", project.id)
      .in("billing_status", ["unbilled", "ready"])
      .select("id");
    if (error) updateErrors.push(error.message);
    else if (!updated?.length) updateErrors.push(`Project "${project.name}" was billed by another invoice.`);
  }
  for (const milestone of milestones) {
    const lineItemId = lineItemBySource.get(`milestone:${milestone.id}`) ?? null;
    const { data: updated, error } = await supabase
      .from("project_milestones")
      .update({ billing_status: "billed", invoice_line_item_id: lineItemId })
      .eq("id", milestone.id)
      .in("billing_status", ["unbilled", "ready"])
      .select("id");
    if (error) updateErrors.push(error.message);
    else if (!updated?.length) updateErrors.push(`Milestone "${milestone.name}" was billed by another invoice.`);
  }
  for (const contract of recurringContracts) {
    const amount = Number(contract.monthly_recurring_fee ?? 0);
    const recognition = contract.billing_timing === "in_advance" ? "deferred" : "earned";
    const { error } = await supabase.from("revenue_records").insert({
      customer_id: customerId,
      contract_id: contract.id,
      period_month: billingPeriodStart,
      revenue_type: "recurring",
      recognition,
      amount,
      description: `${contract.name} monthly support invoiced for ${billingPeriodStart}`,
      source_type: "invoice",
      source_id: invoice.id,
    });
    if (error) updateErrors.push(error.message);
  }

  return NextResponse.json({
    invoice: {
      id: invoice.id,
      invoiceNumber: invoice.invoice_number,
      totalAmount: invoice.total_amount,
      status: invoice.status,
    },
    warnings: updateErrors.length > 0 ? updateErrors : undefined,
  });
}
