/**
 * Detect live control exceptions from operational data.
 * Each row maps to a documented control and explains probable cause.
 */

export type ControlFailureSeverity = "critical" | "warning";

export type ControlFailure = {
  id: string;
  controlId: string;
  controlName: string;
  category: string;
  detectedAt: string;
  severity: ControlFailureSeverity;
  summary: string;
  probableCause: string;
  detail: string;
  href: string;
  hrefLabel: string;
};

type ContractRow = {
  id: string;
  contract_number: string;
  name: string;
  status: string;
  end_date: string | null;
  payment_terms: string | null;
  billing_frequency: string | null;
  updated_at?: string | null;
};

type ModRow = {
  id: string;
  contract_id: string;
  modification_summary: string;
  created_at: string;
  contracts?:
    | { contract_number: string; name: string }
    | { contract_number: string; name: string }[]
    | null;
};

type InvoiceRow = {
  id: string;
  invoice_number: string;
  created_at: string;
  status: string;
};

type ApprovalRow = {
  id: string;
  created_at?: string | null;
  work_date?: string | null;
  cost_date?: string | null;
  title?: string | null;
};

type TicketRow = {
  id: string;
  ticket_number: string;
  title: string;
  status: string;
  priority: string | null;
  submitted_at: string | null;
  target_resolution_at: string | null;
  completed_at: string | null;
};

type MissingDocRow = {
  id: string;
  contract_number: string;
  name: string;
};

function unwrapContract(mod: ModRow) {
  const value = mod.contracts;
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function daysBetween(iso: string | null | undefined, now: Date) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - start.getTime()) / 86_400_000);
}

export type ControlFailureInput = {
  now?: Date;
  activeContracts: ContractRow[];
  missingSignedDocs: MissingDocRow[];
  pendingPriceMods: ModRow[];
  staleDraftInvoices: InvoiceRow[];
  stalePendingTime: ApprovalRow[];
  stalePendingCosts: ApprovalRow[];
  staleAdditionalWork: ApprovalRow[];
  openTickets: TicketRow[];
};

/** Build interactive control-failure rows from live Supabase snapshots. */
export function buildControlFailures(input: ControlFailureInput): ControlFailure[] {
  const now = input.now ?? new Date();
  const failures: ControlFailure[] = [];

  for (const contract of input.activeContracts) {
    if (!contract.end_date) continue;
    const daysPast = daysBetween(contract.end_date, now);
    if (daysPast == null || daysPast < 0) continue;
    failures.push({
      id: `past-end-${contract.id}`,
      controlId: "contract-renewals",
      controlName: "Renewal & expiration monitoring",
      category: "Contract",
      detectedAt: contract.end_date,
      severity: "critical",
      summary: `${contract.contract_number} is still Active after its end date`,
      probableCause:
        "Renewal was not processed (or status not updated) before the term ended, so the agreement lapsed while remaining billable/active in the system.",
      detail: `${contract.name} ended ${daysPast === 0 ? "today" : `${daysPast} day${daysPast === 1 ? "" : "s"} ago`} and is still marked active.`,
      href: `/contracts/${contract.id}`,
      hrefLabel: "Open contract",
    });
  }

  for (const contract of input.activeContracts) {
    const missingTerms = !contract.payment_terms;
    const missingFreq = !contract.billing_frequency;
    if (!missingTerms && !missingFreq) continue;
    const gaps = [
      missingTerms ? "payment terms" : null,
      missingFreq ? "billing frequency" : null,
    ].filter(Boolean);
    failures.push({
      id: `billing-terms-${contract.id}`,
      controlId: "contract-active-billing",
      controlName: "Active in-term contract required for billing",
      category: "Contract",
      detectedAt: contract.updated_at ?? now.toISOString(),
      severity: "warning",
      summary: `${contract.contract_number} is active but missing ${gaps.join(" and ")}`,
      probableCause:
        "The agreement was activated or edited without completing commercial billing fields, so Ready-to-Bill / recurring invoice rules may skip or mis-price the account.",
      detail: `${contract.name} needs ${gaps.join(" and ")} before billing controls can fully apply.`,
      href: `/contracts/${contract.id}/edit`,
      hrefLabel: "Complete terms",
    });
  }

  for (const row of input.missingSignedDocs) {
    failures.push({
      id: `signed-doc-${row.id}`,
      controlId: "contract-signed-agreement",
      controlName: "Signed agreement on file",
      category: "Contract",
      detectedAt: now.toISOString(),
      severity: "warning",
      summary: `${row.contract_number} has no current signed agreement document`,
      probableCause:
        "The contract was activated without uploading a signed_contract document, so there is no enforceable paper trail for the live terms.",
      detail: `${row.name} is active but the document checklist shows no current signed agreement.`,
      href: `/contracts/${row.id}#documents`,
      hrefLabel: "Upload document",
    });
  }

  for (const mod of input.pendingPriceMods) {
    const age = daysBetween(mod.created_at, now) ?? 0;
    if (age < 3) continue;
    const contract = unwrapContract(mod);
    failures.push({
      id: `price-mod-${mod.id}`,
      controlId: "contract-price-approval",
      controlName: "Manager approval for price changes",
      category: "Contract",
      detectedAt: mod.created_at,
      severity: age >= 7 ? "critical" : "warning",
      summary: `Price change pending ${age} day${age === 1 ? "" : "s"} on ${contract?.contract_number ?? "a contract"}`,
      probableCause:
        "A commercial term change was submitted on an active contract, but a manager has not approved or rejected it yet — live prices remain unchanged while the exception ages.",
      detail: mod.modification_summary,
      href: contract ? `/contracts/${mod.contract_id}` : "/contracts",
      hrefLabel: "Review modification",
    });
  }

  for (const invoice of input.staleDraftInvoices) {
    failures.push({
      id: `draft-inv-${invoice.id}`,
      controlId: "billing-draft-review",
      controlName: "Draft invoice review before send",
      category: "Billing",
      detectedAt: invoice.created_at,
      severity: "warning",
      summary: `Draft invoice ${invoice.invoice_number} has sat unreviewed for 7+ days`,
      probableCause:
        "Invoice generation created a draft, but billing review / issue was never completed, so cash collection and AR recognition are delayed.",
      detail: "Draft invoices must be reviewed and issued before they can be sent or paid.",
      href: "/billing-review",
      hrefLabel: "Open billing review",
    });
  }

  for (const entry of input.stalePendingTime) {
    const when = entry.work_date ?? entry.created_at ?? now.toISOString();
    failures.push({
      id: `time-${entry.id}`,
      controlId: "work-additional",
      controlName: "Approval before billable work",
      category: "Work",
      detectedAt: when,
      severity: "warning",
      summary: "Time entry pending approval for 7+ days",
      probableCause:
        "Billable or out-of-scope time was submitted but never approved, so Ready to Bill correctly blocks it — creating a revenue recognition exception until a manager acts.",
      detail: "Stale pending time cannot move into an invoice under current billing controls.",
      href: "/time-cost-approvals",
      hrefLabel: "Approve time",
    });
  }

  for (const cost of input.stalePendingCosts) {
    const when = cost.cost_date ?? cost.created_at ?? now.toISOString();
    failures.push({
      id: `cost-${cost.id}`,
      controlId: "billing-approvals",
      controlName: "Approved costs only on invoices",
      category: "Billing",
      detectedAt: when,
      severity: "warning",
      summary: "Direct cost pending approval for 7+ days",
      probableCause:
        "A recoverable cost was logged above the approval threshold but never cleared, so invoice generation refuses it and margin reporting stays incomplete.",
      detail: "Unapproved direct costs are excluded from Ready to Bill and invoice generation.",
      href: "/time-cost-approvals",
      hrefLabel: "Approve costs",
    });
  }

  for (const work of input.staleAdditionalWork) {
    failures.push({
      id: `aw-${work.id}`,
      controlId: "work-additional",
      controlName: "Out-of-scope / additional work approval",
      category: "Work",
      detectedAt: work.created_at ?? now.toISOString(),
      severity: "warning",
      summary: `Additional work request pending 7+ days${work.title ? `: ${work.title}` : ""}`,
      probableCause:
        "Technicians opened additional work, but manager/customer approval never completed — hours stay unbillable and the exception ages in the queue.",
      detail: "Pending additional-work approvals block related billable classifications.",
      href: "/additional-work",
      hrefLabel: "Review additional work",
    });
  }

  for (const ticket of input.openTickets) {
    if (!ticket.target_resolution_at || ticket.completed_at) continue;
    const target = new Date(ticket.target_resolution_at);
    if (Number.isNaN(target.getTime()) || target.getTime() >= now.getTime()) continue;
    failures.push({
      id: `sla-${ticket.id}`,
      controlId: "work-sla",
      controlName: "SLA monitoring & escalation",
      category: "Work",
      detectedAt: ticket.target_resolution_at,
      severity: ticket.priority === "critical" || ticket.priority === "high" ? "critical" : "warning",
      summary: `SLA missed on ${ticket.ticket_number}`,
      probableCause:
        "The ticket remained open past its contract resolution target — staffing, prioritization, or delayed first response likely prevented meeting the SLA control.",
      detail: ticket.title || "Open ticket past target resolution time.",
      href: `/tickets/${ticket.id}`,
      hrefLabel: "Open ticket",
    });
  }

  failures.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
    return b.detectedAt.localeCompare(a.detectedAt);
  });

  return failures;
}
