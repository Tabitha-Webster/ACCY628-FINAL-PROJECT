/**
 * Controls and Exceptions catalog — risk → control → where to demo in the app.
 * Used by the interactive Controls explorer (managers / admins).
 */

export type ControlWhereLink = {
  href: string;
  label: string;
  /** Hidden for non-admin viewers (managers cannot open these screens). */
  adminOnly?: boolean;
};

export type ControlItem = {
  id: string;
  category: string;
  /** Plain-language risk (completes: "This business faces the risk that…"). */
  risk: string;
  /** Plain-language control (completes: "The system reduces that risk by ensuring…"). */
  control: string;
  /** Judge-friendly "What if…" scenario shown on the card face. */
  whatIf: string;
  /** Deep links so the panel can jump into the live control. */
  where: ControlWhereLink[];
};

export const CONTROL_CATEGORY_ORDER = [
  "Access",
  "Contract",
  "Work",
  "Billing",
  "Payment",
  "Data Integrity",
  "Accounting",
] as const;

export const CONTROLS_CATALOG: ControlItem[] = [
  {
    id: "access-roles",
    category: "Access",
    risk: "an unauthorized person could view or change customer, contract, or financial data",
    control:
      "every user signs in with a role (manager, technician, billing, or customer) and the system only shows screens and data that role is permitted to see",
    whatIf: "What if a technician tries to open billing or change contract prices?",
    where: [
      { href: "/login", label: "Demo role login" },
      { href: "/admin/role-permissions", label: "Role permissions", adminOnly: true },
    ],
  },
  {
    id: "access-rls",
    category: "Access",
    risk: "a technician could see another customer's confidential contract terms or another technician's pay-affecting cost rate",
    control:
      "row-level security policies on the database restrict technicians to their own assigned tickets and time entries, and restrict customers to only their own records",
    whatIf: "What if a help-desk tech opens another customer's private records?",
    where: [
      { href: "/tickets", label: "Support tickets" },
      { href: "/dashboard", label: "Technician assignments" },
    ],
  },
  {
    id: "access-customer-approval",
    category: "Access",
    risk: "a self-registered customer could reach invoices, tickets, or account data before management has vetted the account",
    control:
      "new customer portal accounts stay non-active until an admin approves them; middleware redirects unapproved customers to Pending Approval and blocks the rest of the app until the customer status is active",
    whatIf: "What if a newly signed-up customer tries to open invoices before approval?",
    where: [
      { href: "/customer-approvals", label: "Customer approvals" },
    ],
  },
  {
    id: "access-audit-log",
    category: "Access",
    risk: "sensitive changes to users, roles, customers, contracts, or invoices could happen without a durable record of who changed what",
    control:
      "the system audit log records insert, update, and delete events with actor, entity, changed fields, and before/after values so managers and admins can reconstruct access and financial changes",
    whatIf: "What if we need to prove who changed a user's role or an invoice total?",
    where: [
      { href: "/admin/audit", label: "System audit log", adminOnly: true },
      { href: "/admin/role-permissions", label: "Role permissions", adminOnly: true },
    ],
  },
  {
    id: "access-review",
    category: "Access",
    risk: "management could lose track of which roles can see financial or customer data, allowing excess access to go unchallenged",
    control:
      "the Security & Access Review screen shows a role-by-area matrix of who can reach financial and customer information, so admins can periodically confirm that access still matches job responsibilities",
    whatIf: "What if we need to show auditors which roles can see AR and customer records?",
    where: [
      { href: "/admin/access-review", label: "Security & Access Review", adminOnly: true },
      { href: "/admin/users", label: "Manage users", adminOnly: true },
    ],
  },
  {
    id: "access-role-matrix",
    category: "Access",
    risk: "a role could retain (or gain) screens it should not have after duties change, without a clear place to correct it",
    control:
      "admins maintain a page-level role permission matrix that determines which application screens each C2C role can open; middleware enforces those grants, and admin access itself cannot be reduced",
    whatIf: "What if billing should no longer open profitability, or HR needs a new screen?",
    where: [
      { href: "/admin/role-permissions", label: "Role permissions", adminOnly: true },
      { href: "/admin/access-review", label: "Security & Access Review", adminOnly: true },
    ],
  },
  {
    id: "contract-active-billing",
    category: "Contract",
    risk: "work could be performed or billed without an active, approved service agreement in place",
    control:
      "billing and Ready-to-Bill eligibility require an active contract within its term dates; draft, on-hold, expired, and canceled agreements cannot be billed",
    whatIf: "What if someone tries to invoice work on a draft or expired contract?",
    where: [
      { href: "/contracts", label: "Manage contracts" },
      { href: "/ready-to-bill", label: "Ready to Bill" },
    ],
  },
  {
    id: "contract-price-approval",
    category: "Contract",
    risk: "price or commercial terms on a live agreement could change without manager oversight",
    control:
      "price changes on active contracts are held as pending modifications until a manager explicitly approves them; they do not update the live contract until approved",
    whatIf: "What if MRR is edited on an active agreement without a manager?",
    where: [
      { href: "/contracts?status=active", label: "Active contracts" },
      { href: "/contracts", label: "Manage contracts" },
    ],
  },
  {
    id: "contract-audit-trail",
    category: "Contract",
    risk: "contract terms could be edited without an audit trail explaining why",
    control:
      "every contract edit requires a change reason, and field-level history records previous value, new value, user, date, and reason, with major commercial terms highlighted",
    whatIf: "What if we need to prove who changed a rate and why?",
    where: [{ href: "/contracts", label: "Open a contract → Changes" }],
  },
  {
    id: "contract-signed-agreement",
    category: "Contract",
    risk: "an active agreement could be billed and enforced without a signed contract document on file",
    control:
      "Manage Contracts surfaces active agreements missing a current signed_contract document, and the Controls exceptions chart flags those gaps so managers can upload the signed agreement before the paper trail is incomplete",
    whatIf: "What if a live contract has no signed agreement uploaded?",
    where: [
      { href: "/contracts", label: "Manage contracts (document checklist)" },
    ],
  },
  {
    id: "contract-active-warning",
    category: "Contract",
    risk: "someone could edit an active agreement without realizing it affects live billing and SLA",
    control:
      "editing an active contract shows a warning dialog and requires an on-form acknowledgment before changes can be saved",
    whatIf: "What if a manager opens Edit on a live customer agreement?",
    where: [{ href: "/contracts?status=active", label: "Edit an active contract" }],
  },
  {
    id: "contract-renewals",
    category: "Contract",
    risk: "a contract could lapse or auto-renew on unfavorable terms without anyone noticing",
    control:
      "the Renewal & Expiration page generates 90/60/30-day renewal reminders and expiration warnings, supports auto-renew processing, and keeps a renewal history so managers can act before a term lapses",
    whatIf: "What if a renewal is 30 days out and nobody is watching?",
    where: [
      { href: "/contracts/renewals", label: "Renewal & Expiration" },
      { href: "/contracts/reports", label: "Contracts Dashboard calendar" },
    ],
  },
  {
    id: "work-additional",
    category: "Work",
    risk: "technicians could perform unapproved or out-of-scope work that the company cannot recover the cost of",
    control:
      "additional work requests and out-of-scope classifications require manager or customer approval before the associated hours can be billed",
    whatIf: "What if a tech logs out-of-scope hours before anyone approves?",
    where: [
      { href: "/additional-work", label: "Additional work" },
      { href: "/time-cost-approvals", label: "Approve time & costs" },
    ],
  },
  {
    id: "work-reapproval",
    category: "Work",
    risk: "an approved time entry, cost, project, milestone, ticket, or contract change could be edited afterward and billed under the old approval",
    control:
      "changing an approved record clears its approval so it must be reviewed again; billed records cannot be edited and reviewed invoices return to draft if their charges change",
    whatIf: "What if someone edits an already-approved time entry?",
    where: [{ href: "/time-costs", label: "Time and costs" }],
  },
  {
    id: "work-sla",
    category: "Work",
    risk: "a customer could be missed or receive degraded service without management awareness",
    control:
      "service operations tracks every open ticket against its SLA target and highlights any ticket at risk of, or already past, its resolution deadline",
    whatIf: "What if an SLA deadline is about to be missed?",
    where: [
      { href: "/operations", label: "Service Operations" },
      { href: "/tickets", label: "Support tickets" },
    ],
  },
  {
    id: "billing-ready",
    category: "Billing",
    risk: "completed work could be forgotten and never invoiced, or the same work could be billed twice",
    control:
      "Ready to Bill uses ticket eligibility views so only billable, approved, unbilled work with completion notes, an active in-term contract, and clear ticket/customer/technician links can be selected; once placed on an invoice the source row is marked billed with invoice_id and billed_at so it cannot be selected again",
    whatIf: "What if the same completed ticket is selected for two invoices?",
    where: [{ href: "/ready-to-bill", label: "Ready to Bill" }],
  },
  {
    id: "billing-double",
    category: "Billing",
    risk: "the same time entry could be placed on more than one invoice, double-charging the customer",
    control:
      "invoice generation refuses any time entry that is already billed, linked to an invoice, or present on another non-canceled invoice line; monthly usage skips those hours so they are not billed again as overage; Ready to Bill also hides already-invoiced ticket time; the database blocks a second active time-entry line for that same source and will not mark an already-invoiced time entry as billed again",
    whatIf: "What if invoice generation tries to reuse billed hours?",
    where: [
      { href: "/ready-to-bill", label: "Ready to Bill" },
      { href: "/invoices", label: "Invoices" },
    ],
  },
  {
    id: "billing-authority",
    category: "Billing",
    risk: "an invoice could be generated by someone without billing authority, or with amounts that do not tie back to underlying work",
    control:
      "only manager and billing roles can generate invoices, and every invoice line item is linked back to the specific time entry, cost, or project it was billed from",
    whatIf: "What if a non-billing role tries to create an invoice?",
    where: [{ href: "/invoices", label: "Invoices" }],
  },
  {
    id: "billing-draft-review",
    category: "Billing",
    risk: "a draft invoice could be sent to a customer before anyone checks the charges",
    control:
      "new invoices are created as drafts; they must be reviewed and issued before they can be marked sent, receive payment, or appear in accounts receivable",
    whatIf: "What if someone tries to collect payment on a draft invoice?",
    where: [
      { href: "/billing-review", label: "Billing review" },
      { href: "/invoices", label: "Invoices" },
    ],
  },
  {
    id: "billing-approvals",
    category: "Billing",
    risk: "unapproved extra work, costs, or project changes could be billed to the customer",
    control:
      "invoice generation and the database both refuse unapproved billable or out-of-scope time, unapproved direct costs, unapproved projects, and incomplete or unapproved milestones",
    whatIf: "What if unapproved additional work is sitting in Ready to Bill?",
    where: [
      { href: "/time-cost-approvals", label: "Approvals queue" },
      { href: "/ready-to-bill", label: "Ready to Bill" },
    ],
  },
  {
    id: "billing-totals",
    category: "Billing",
    risk: "an invoice header total could be changed so it no longer matches the line items the customer was charged",
    control:
      "the stored invoice total must equal the sum of its line amounts plus tax minus credits; review and send are blocked if the totals do not match, and the database rejects mismatched issued invoices",
    whatIf: "What if the invoice header no longer equals the lines?",
    where: [{ href: "/billing-review", label: "Billing review" }],
  },
  {
    id: "billing-disputes",
    category: "Billing",
    risk: "cash could be collected on an invoice the customer has formally contested, or a dispute could sit unresolved with no operational visibility",
    control:
      "managers and billing can open an invoice dispute with a reason and amount; disputed invoices are blocked from payment recording until the dispute is resolved, and open disputes appear on Billing and Collections",
    whatIf: "What if someone tries to record a payment on a disputed invoice?",
    where: [
      { href: "/billing-collections", label: "Billing and Collections" },
      { href: "/payments", label: "Payments" },
    ],
  },
  {
    id: "payment-overpay",
    category: "Payment",
    risk: "a payment could be recorded for more than a customer actually owes, or applied to an invoice that was already canceled",
    control:
      "the payment recording form validates that the payment amount does not exceed the invoice's remaining balance",
    whatIf: "What if someone enters a payment larger than the balance due?",
    where: [{ href: "/payments", label: "Payments" }],
  },
  {
    id: "payment-canceled",
    category: "Payment",
    risk: "cash could be applied to a canceled invoice, making the customer look paid when the invoice is no longer valid",
    control:
      "canceled invoices are hidden from the payment screen, the payment API refuses them, and the database blocks any payment application against a canceled invoice",
    whatIf: "What if a canceled invoice still appears on the payment screen?",
    where: [
      { href: "/payments", label: "Payments" },
      { href: "/invoices", label: "Invoices" },
    ],
  },
  {
    id: "payment-ar",
    category: "Payment",
    risk: "cash could be collected but the accounts receivable balance never updated, hiding the true amount owed",
    control:
      "recording a payment automatically reduces the invoice's remaining balance and updates its status to partially paid or paid in the same transaction",
    whatIf: "What if cash is recorded but AR still shows the old balance?",
    where: [
      { href: "/payments", label: "Record a payment" },
      { href: "/accounts-receivable", label: "Accounts receivable" },
    ],
  },
  {
    id: "payment-ar-aging",
    category: "Payment",
    risk: "overdue customer balances could age without management noticing, delaying collections and understating credit risk",
    control:
      "Accounts Receivable buckets open invoices by days past due with an aging chart, and Billing and Collections surfaces overdue invoices alongside open disputes so managers can prioritize follow-up",
    whatIf: "What if a large invoice slips past 60 days with no one chasing it?",
    where: [
      { href: "/accounts-receivable", label: "Accounts receivable" },
      { href: "/billing-collections", label: "Billing and Collections" },
    ],
  },
  {
    id: "integrity-totals",
    category: "Data Integrity",
    risk: "manually re-typed totals could drift from the underlying detail records over time",
    control:
      "invoice header totals are calculated from line items when the invoice is created and must stay equal to the sum of those lines plus tax minus credits; accounts receivable and profitability figures are calculated from invoice, payment, cost, and labor records rather than re-typed by hand",
    whatIf: "What if someone re-types a total instead of deriving it?",
    where: [
      { href: "/accounts-receivable", label: "Accounts receivable" },
      { href: "/profitability", label: "Profitability" },
    ],
  },
  {
    id: "integrity-monitoring",
    category: "Data Integrity",
    risk: "incomplete master data, stale approvals, or failed operational checks could sit unnoticed until billing or reporting breaks",
    control:
      "admin Data Quality scans customers, contracts, tickets, users, and projects for missing links and required fields, while the Exception Log highlights stale drafts, pending approvals, and other technical exceptions that need cleanup",
    whatIf: "What if active contracts are missing billing terms or tickets have no contract link?",
    where: [
      { href: "/admin/data-quality", label: "Data quality", adminOnly: true },
      { href: "/admin/exceptions", label: "Exception log", adminOnly: true },
      { href: "/contracts", label: "Manage contracts" },
      { href: "/time-cost-approvals", label: "Approvals queue" },
    ],
  },
  {
    id: "accounting-margin",
    category: "Accounting",
    risk: "management could believe the company is profitable on a customer while actually losing money after labor and direct costs",
    control:
      "the profitability view compares earned revenue against both direct costs and technician labor cost for every customer and contract, and flags low-margin or unprofitable relationships",
    whatIf: "What if a 'good' customer is actually underwater on margin?",
    where: [{ href: "/profitability", label: "Profitability" }],
  },
  {
    id: "accounting-recognition",
    category: "Accounting",
    risk: "earned, deferred, and unbilled revenue could be confused, misstating the company's financial position",
    control:
      "every dollar of revenue is tagged with a type and a recognition status (earned, deferred, or unbilled), and the accounting review screen reports each category separately with plain-language definitions",
    whatIf: "What if deferred revenue is treated as already earned?",
    where: [{ href: "/accounting", label: "Accounting review" }],
  },
];
