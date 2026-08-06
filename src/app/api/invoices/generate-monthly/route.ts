import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import {
  billingPeriodFromStart,
  computeMonthlyUsage,
  currentBillingPeriod,
  invoiceTotalsMismatchReason,
  makeInvoiceLine,
  round2,
  summarizeInvoice,
} from "@/lib/billing";
import {
  isApprovedForBilling,
  isOpenBillingStatus,
  isTimeEntryAlreadyInvoiced,
  pendingAdditionalWorkBlockReason,
  projectBillingBlockReason,
} from "@/lib/billing-eligibility";
import { billedHourlyRate, billedMonthlyRecurringFee } from "@/lib/contracts";

function generateInvoiceNumber(): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `INV-${stamp}-${suffix}`;
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  if (!["manager", "billing"].includes(profile.role)) {
    return NextResponse.json({ error: "Only billing and manager roles can generate invoices." }, { status: 403 });
  }

  let body: { contractIds?: string[]; periodStart?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const supabase = await createClient();
  const requestedStart = typeof body.periodStart === "string" && /^\d{4}-\d{2}-01$/.test(body.periodStart) ? body.periodStart : null;
  const { start: periodStart, end: periodEnd, label: periodLabel } = requestedStart
    ? billingPeriodFromStart(requestedStart)
    : currentBillingPeriod();

  let contractQuery = supabase
    .from("contracts")
    .select(
      "id, name, customer_id, status, monthly_recurring_fee, work_location, included_hours_per_month, additional_hourly_rate, payment_terms, billing_timing, tax_status"
    )
    .eq("status", "active");

  if (body.contractIds?.length) {
    contractQuery = contractQuery.in("id", body.contractIds);
  }

  const { data: contracts, error: contractError } = await contractQuery;
  if (contractError) return NextResponse.json({ error: contractError.message }, { status: 500 });
  if (!contracts?.length) {
    return NextResponse.json({ error: "No active contracts were selected." }, { status: 400 });
  }

  const { data: existingRecurringLines } = await supabase
    .from("invoice_line_items")
    .select("source_id, invoice_id, invoices(status, billing_period_start)")
    .eq("source_type", "recurring");

  const alreadyBilled = new Set(
    (existingRecurringLines ?? [])
      .filter((row) => {
        const invoice = Array.isArray(row.invoices) ? row.invoices[0] : row.invoices;
        return invoice && invoice.status !== "canceled" && invoice.billing_period_start === periodStart;
      })
      .map((row) => row.source_id)
  );

  const created: { invoiceNumber: string; contractName: string; total: number }[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  for (const contract of contracts) {
    const monthlyAlreadyBilled = alreadyBilled.has(contract.id);

    const [{ data: timeEntries }, { data: directCosts }, { data: projects }, { data: milestones }, { data: pendingAw }] =
      await Promise.all([
      supabase
        .from("time_entries")
        .select(
          "id, hours_worked, classification, approval_status, billing_status, work_date, project_id, support_ticket_id, invoice_id, invoice_line_item_id, billed_at"
        )
        .eq("contract_id", contract.id)
        .gte("work_date", periodStart)
        .lte("work_date", periodEnd),
      supabase
        .from("direct_costs")
        .select("id, cost_category, description, billable_amount, approval_status, billing_status, vendor")
        .eq("contract_id", contract.id)
        .eq("approval_status", "approved")
        .in("billing_status", ["unbilled", "ready"])
        .in("cost_category", ["software", "equipment"]),
      supabase
        .from("projects")
        .select("id, name, fixed_fee, estimated_billing_amount, status, billing_status, amount_billed, uses_milestone_billing, customer_approval_status")
        .eq("contract_id", contract.id)
        .eq("uses_milestone_billing", false)
        .in("status", ["completed", "approved"])
        .in("billing_status", ["unbilled", "ready"]),
      supabase
        .from("project_milestones")
        .select("id, name, amount, billing_status, approval_status, completed, project_id, projects!inner(contract_id, name)")
        .eq("completed", true)
        .in("approval_status", ["approved", "not_required"])
        .in("billing_status", ["unbilled", "ready"])
        .eq("projects.contract_id", contract.id),
      supabase
        .from("additional_work_requests")
        .select("id, project_id, support_ticket_id")
        .eq("contract_id", contract.id)
        .eq("approval_status", "pending"),
    ]);

    const pendingAwByProject = new Set(
      (pendingAw ?? []).map((r) => r.project_id).filter((id): id is string => Boolean(id))
    );
    const pendingAwByTicket = new Set(
      (pendingAw ?? []).map((r) => r.support_ticket_id).filter((id): id is string => Boolean(id))
    );

    const usage = computeMonthlyUsage(
      timeEntries ?? [],
      Number(contract.included_hours_per_month ?? 0),
      billedHourlyRate(contract),
      billedMonthlyRecurringFee(contract)
    );
    const approvedProjects = (projects ?? []).filter((project) => {
      if (projectBillingBlockReason(project)) return false;
      return !pendingAdditionalWorkBlockReason({
        hasPendingAdditionalWork: pendingAwByProject.has(project.id),
        contextLabel: project.name,
      });
    });
    const approvedMilestones = (milestones ?? []).filter(
      (milestone) =>
        !pendingAdditionalWorkBlockReason({
          hasPendingAdditionalWork: pendingAwByProject.has(milestone.project_id),
          contextLabel: milestone.name,
        })
    );

    const drafts = [];

    if (!monthlyAlreadyBilled && usage.monthlyFee > 0) {
      drafts.push(
        makeInvoiceLine({
          description: `${contract.name} monthly support fee — ${periodLabel}`,
          quantity: 1,
          rate: usage.monthlyFee,
          source_type: "recurring",
          source_id: contract.id,
        })
      );
    }

    if (!monthlyAlreadyBilled && usage.includedHours > 0) {
      drafts.push(
        makeInvoiceLine({
          description: `Included support hours used — ${usage.includedHoursUsed.toFixed(1)} of ${usage.includedHours.toFixed(1)} hrs`,
          quantity: usage.includedHoursUsed,
          rate: 0,
          source_type: "hours_included",
          source_id: contract.id,
        })
      );
    }

    if (!monthlyAlreadyBilled && usage.overageHours > 0 && usage.overageCharge > 0) {
      drafts.push(
        makeInvoiceLine({
          description: `Overage support hours — ${usage.overageHours.toFixed(1)} hrs above included allotment`,
          quantity: usage.overageHours,
          rate: usage.additionalHourlyRate,
          source_type: "overage",
          source_id: contract.id,
        })
      );
    }

    for (const project of approvedProjects) {
      const amount = round2(Number(project.fixed_fee || project.estimated_billing_amount || 0));
      if (amount <= 0) continue;
      drafts.push(
        makeInvoiceLine({
          description: `Approved project: ${project.name}`,
          quantity: 1,
          rate: amount,
          source_type: "project",
          source_id: project.id,
        })
      );
    }

    for (const milestone of approvedMilestones) {
      const amount = round2(Number(milestone.amount ?? 0));
      if (amount <= 0) continue;
      const project = Array.isArray(milestone.projects) ? milestone.projects[0] : milestone.projects;
      drafts.push(
        makeInvoiceLine({
          description: `Approved milestone: ${project?.name ?? "Project"} — ${milestone.name}`,
          quantity: 1,
          rate: amount,
          source_type: "milestone",
          source_id: milestone.id,
        })
      );
    }

    for (const cost of directCosts ?? []) {
      const amount = round2(Number(cost.billable_amount ?? 0));
      if (amount <= 0) continue;
      const kind = cost.cost_category === "software" ? "Software" : "Equipment";
      drafts.push(
        makeInvoiceLine({
          description: `Approved ${kind.toLowerCase()} charge: ${cost.description}${cost.vendor ? ` (${cost.vendor})` : ""}`,
          quantity: 1,
          rate: amount,
          source_type: "direct_cost",
          source_id: cost.id,
        })
      );
    }

    const totals = summarizeInvoice(drafts, {
      taxStatus: contract.tax_status,
      paymentTerms: contract.payment_terms,
      currentStatus: "draft",
    });

    if (totals.subtotal <= 0) {
      skipped.push(
        monthlyAlreadyBilled
          ? `${contract.name} already has a monthly invoice for ${periodLabel} and has no new project or equipment/software charges.`
          : `${contract.name} has no monthly fee, overage, project, or equipment/software charges this period.`
      );
      continue;
    }

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        invoice_number: generateInvoiceNumber(),
        customer_id: contract.customer_id,
        contract_id: contract.id,
        invoice_date: totals.invoiceDate,
        due_date: totals.dueDate,
        status: totals.status,
        billing_period_start: periodStart,
        billing_period_end: periodEnd,
        subtotal: totals.subtotal,
        tax_amount: totals.taxAmount,
        credits: totals.credits,
        total_amount: totals.totalAmount,
        amount_paid: 0,
        remaining_balance: totals.remainingBalance,
        notes: `Monthly contract invoice for ${periodLabel}. Included hours used: ${usage.includedHoursUsed.toFixed(1)}. Overage hours: ${usage.overageHours.toFixed(1)}. Tax ${totals.taxExempt ? "exempt" : `${(totals.taxRate * 100).toFixed(1)}%`}. Due ${totals.dueDate}.`,
        generated_by: profile.id,
        generated_at: new Date().toISOString(),
      })
      .select("id, invoice_number, total_amount")
      .single();

    if (invoiceError || !invoice) {
      errors.push(`${contract.name}: ${invoiceError?.message ?? "failed to create invoice"}`);
      continue;
    }

    const { data: lineItems, error: lineError } = await supabase
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
      .select("id, source_type, source_id, line_amount");

    if (lineError || !lineItems) {
      const duplicateTimeEntry = /already been invoiced|invoice_line_items_unique_source|duplicate key/i.test(
        lineError?.message ?? ""
      );
      const unapproved = /unapproved/i.test(lineError?.message ?? "");
      errors.push(
        duplicateTimeEntry
          ? `${contract.name}: a time entry on this invoice was already billed and cannot be invoiced again.`
          : unapproved
            ? `${contract.name}: unapproved changes cannot be billed.`
            : `${contract.name}: invoice ${invoice.invoice_number} created but line items failed.`
      );
      continue;
    }

    const totalsMismatch = invoiceTotalsMismatchReason(
      {
        subtotal: totals.subtotal,
        tax_amount: totals.taxAmount,
        credits: totals.credits,
        total_amount: totals.totalAmount,
      },
      lineItems
    );
    if (totalsMismatch) {
      errors.push(`${contract.name}: ${totalsMismatch}`);
      continue;
    }

    const lineBySource = new Map(lineItems.map((li) => [`${li.source_type}:${li.source_id}`, li.id]));

    if (!monthlyAlreadyBilled) {
      const billableTimeIds = (timeEntries ?? [])
        .filter((entry) => {
          if (isTimeEntryAlreadyInvoiced(entry) || !isOpenBillingStatus(entry.billing_status)) return false;
          if (entry.classification === "included") return true;
          if (entry.classification === "out_of_scope") {
            if (entry.approval_status !== "approved") return false;
            const pendingOnProject = entry.project_id ? pendingAwByProject.has(entry.project_id) : false;
            const pendingOnTicket = entry.support_ticket_id ? pendingAwByTicket.has(entry.support_ticket_id) : false;
            return !pendingOnProject && !pendingOnTicket;
          }
          if (entry.classification === "billable") {
            if (!isApprovedForBilling(entry.approval_status)) return false;
            const pendingOnProject = entry.project_id ? pendingAwByProject.has(entry.project_id) : false;
            const pendingOnTicket = entry.support_ticket_id ? pendingAwByTicket.has(entry.support_ticket_id) : false;
            return !pendingOnProject && !pendingOnTicket;
          }
          return false;
        })
        .map((entry) => entry.id);

      if (billableTimeIds.length > 0) {
        const overageLineId = lineBySource.get("overage:" + contract.id) ?? lineBySource.get("hours_included:" + contract.id) ?? null;
        const { error: markError } = await supabase.rpc("mark_time_entries_billed", {
          p_entry_ids: billableTimeIds,
          p_invoice_id: invoice.id,
          p_line_item_id: overageLineId,
        });
        if (markError) {
          errors.push(`${contract.name}: invoice ${invoice.invoice_number} created but a time entry was already invoiced.`);
          continue;
        }
      }
    }

    for (const project of approvedProjects) {
      const amount = round2(Number(project.fixed_fee || project.estimated_billing_amount || 0));
      await supabase
        .from("projects")
        .update({
          billing_status: "billed",
          status: "billed",
          amount_billed: Number(project.amount_billed ?? 0) + amount,
        })
        .eq("id", project.id)
        .in("billing_status", ["unbilled", "ready"]);
    }

    for (const milestone of approvedMilestones) {
      await supabase
        .from("project_milestones")
        .update({
          billing_status: "billed",
          invoice_line_item_id: lineBySource.get(`milestone:${milestone.id}`) ?? null,
        })
        .eq("id", milestone.id)
        .in("billing_status", ["unbilled", "ready"]);
    }

    for (const cost of directCosts ?? []) {
      await supabase
        .from("direct_costs")
        .update({
          billing_status: "billed",
          invoice_line_item_id: lineBySource.get(`direct_cost:${cost.id}`) ?? null,
        })
        .eq("id", cost.id)
        .in("billing_status", ["unbilled", "ready"]);
    }

    const recognition = contract.billing_timing === "in_advance" ? "deferred" : "earned";
    if (!monthlyAlreadyBilled && usage.monthlyFee > 0) {
      await supabase.from("revenue_records").insert({
        customer_id: contract.customer_id,
        contract_id: contract.id,
        period_month: periodStart,
        revenue_type: "recurring",
        recognition,
        amount: usage.monthlyFee,
        description: `${contract.name} monthly support invoiced for ${periodLabel}`,
        source_type: "invoice",
        source_id: invoice.id,
      });
    }
    if (!monthlyAlreadyBilled && usage.overageCharge > 0) {
      await supabase.from("revenue_records").insert({
        customer_id: contract.customer_id,
        contract_id: contract.id,
        period_month: periodStart,
        revenue_type: "additional_support",
        recognition: "earned",
        amount: usage.overageCharge,
        description: `${contract.name} overage hours invoiced for ${periodLabel}`,
        source_type: "invoice",
        source_id: invoice.id,
      });
    }

    for (const project of approvedProjects) {
      const amount = round2(Number(project.fixed_fee || project.estimated_billing_amount || 0));
      if (amount <= 0) continue;
      await supabase.from("revenue_records").insert({
        customer_id: contract.customer_id,
        contract_id: contract.id,
        period_month: periodStart,
        revenue_type: "project",
        recognition: "earned",
        amount,
        description: `Approved project ${project.name} invoiced for ${periodLabel}`,
        source_type: "invoice",
        source_id: invoice.id,
      });
    }

    for (const milestone of approvedMilestones) {
      const amount = round2(Number(milestone.amount ?? 0));
      if (amount <= 0) continue;
      const project = Array.isArray(milestone.projects) ? milestone.projects[0] : milestone.projects;
      await supabase.from("revenue_records").insert({
        customer_id: contract.customer_id,
        contract_id: contract.id,
        period_month: periodStart,
        revenue_type: "project",
        recognition: "earned",
        amount,
        description: `Approved milestone ${project?.name ?? "Project"} — ${milestone.name} invoiced for ${periodLabel}`,
        source_type: "invoice",
        source_id: invoice.id,
      });
    }

    for (const cost of directCosts ?? []) {
      const amount = round2(Number(cost.billable_amount ?? 0));
      if (amount <= 0) continue;
      await supabase.from("revenue_records").insert({
        customer_id: contract.customer_id,
        contract_id: contract.id,
        period_month: periodStart,
        revenue_type: "software_equipment",
        recognition: "earned",
        amount,
        description: `Approved ${cost.cost_category} charge invoiced for ${periodLabel}: ${cost.description}`,
        source_type: "invoice",
        source_id: invoice.id,
      });
    }

    created.push({
      invoiceNumber: invoice.invoice_number,
      contractName: contract.name,
      total: Number(invoice.total_amount),
    });
  }

  return NextResponse.json({ created, skipped, errors, periodLabel });
}
