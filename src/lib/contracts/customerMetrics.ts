/** Customer health metrics for Contracts & Agreements → Customer. */

export type CustomerLoyaltyTier = "loyal" | "steady" | "at_risk" | "new" | "inactive";

export type CustomerContractRow = {
  id: string;
  name: string;
  industry: string | null;
  status: string;
  credit_terms: string | null;
  primary_contact: string | null;
  contact_email: string | null;
  created_at: string | null;
  activeContracts: number;
  mrr: number;
  tenureMonths: number;
  renewalCount: number;
  outstandingAr: number;
  overdueAr: number;
  openInvoiceCount: number;
  disputeCount: number;
  lifetimeCollected: number;
  paymentCount: number;
  onTimePct: number | null;
  loyalty: CustomerLoyaltyTier;
};

type ContractInput = {
  id: string;
  customer_id: string;
  status: string;
  start_date: string | null;
  monthly_recurring_fee: number | string | null;
};

type InvoiceInput = {
  id: string;
  customer_id: string;
  due_date: string | null;
  status: string | null;
  total_amount: number | string | null;
  amount_paid: number | string | null;
  remaining_balance: number | string | null;
  dispute_status: boolean | string | null;
};

type PaymentInput = {
  id: string;
  customer_id: string;
  payment_date: string | null;
  payment_amount: number | string | null;
};

type PaymentAppInput = {
  payment_id: string;
  invoice_id: string;
  amount_applied: number | string | null;
};

type RenewalInput = {
  contract_id: string;
};

function monthsBetween(fromIso: string, to: Date = new Date()): number {
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) return 0;
  const years = to.getFullYear() - from.getFullYear();
  const months = to.getMonth() - from.getMonth();
  return Math.max(0, years * 12 + months);
}

function isOpenInvoice(invoice: InvoiceInput) {
  const status = String(invoice.status ?? "").toLowerCase();
  if (status === "draft" || status === "canceled" || status === "paid") return false;
  return Number(invoice.remaining_balance ?? 0) > 0.01;
}

export function scoreCustomerLoyalty(input: {
  status: string;
  tenureMonths: number;
  renewalCount: number;
  onTimePct: number | null;
  overdueAr: number;
  activeContracts: number;
}): CustomerLoyaltyTier {
  if (input.status === "inactive") return "inactive";
  if (input.activeContracts === 0 && input.tenureMonths < 3) return "new";
  if (input.overdueAr > 0 || (input.onTimePct != null && input.onTimePct < 70)) return "at_risk";
  if (
    input.tenureMonths >= 12 &&
    input.renewalCount >= 1 &&
    (input.onTimePct == null || input.onTimePct >= 90) &&
    input.overdueAr <= 0
  ) {
    return "loyal";
  }
  if (input.tenureMonths < 6 && input.renewalCount === 0) return "new";
  return "steady";
}

export function buildCustomerContractMetrics(input: {
  customers: Array<{
    id: string;
    name: string;
    industry: string | null;
    status: string;
    credit_terms: string | null;
    primary_contact: string | null;
    contact_email: string | null;
    created_at: string | null;
  }>;
  contracts: ContractInput[];
  invoices: InvoiceInput[];
  payments: PaymentInput[];
  paymentApplications: PaymentAppInput[];
  renewals: RenewalInput[];
  today?: string;
}): CustomerContractRow[] {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const contractsByCustomer = new Map<string, ContractInput[]>();
  const contractCustomer = new Map<string, string>();

  for (const contract of input.contracts) {
    contractCustomer.set(contract.id, contract.customer_id);
    const list = contractsByCustomer.get(contract.customer_id) ?? [];
    list.push(contract);
    contractsByCustomer.set(contract.customer_id, list);
  }

  const renewalsByCustomer = new Map<string, number>();
  for (const renewal of input.renewals) {
    const customerId = contractCustomer.get(renewal.contract_id);
    if (!customerId) continue;
    renewalsByCustomer.set(customerId, (renewalsByCustomer.get(customerId) ?? 0) + 1);
  }

  const invoicesByCustomer = new Map<string, InvoiceInput[]>();
  for (const invoice of input.invoices) {
    const list = invoicesByCustomer.get(invoice.customer_id) ?? [];
    list.push(invoice);
    invoicesByCustomer.set(invoice.customer_id, list);
  }

  const paymentsById = new Map(input.payments.map((p) => [p.id, p]));
  const paymentsByCustomer = new Map<string, PaymentInput[]>();
  for (const payment of input.payments) {
    const list = paymentsByCustomer.get(payment.customer_id) ?? [];
    list.push(payment);
    paymentsByCustomer.set(payment.customer_id, list);
  }

  const latestPaymentDateByInvoice = new Map<string, string>();
  for (const app of input.paymentApplications) {
    const payment = paymentsById.get(app.payment_id);
    if (!payment?.payment_date) continue;
    const prev = latestPaymentDateByInvoice.get(app.invoice_id);
    if (!prev || payment.payment_date > prev) {
      latestPaymentDateByInvoice.set(app.invoice_id, payment.payment_date);
    }
  }

  return input.customers
    .map((customer) => {
      const contracts = contractsByCustomer.get(customer.id) ?? [];
      const activeContracts = contracts.filter((c) => c.status === "active");
      const mrr = activeContracts.reduce((sum, c) => sum + Number(c.monthly_recurring_fee ?? 0), 0);
      const startDates = contracts
        .map((c) => c.start_date)
        .filter((d): d is string => Boolean(d))
        .sort();
      const tenureAnchor = startDates[0] ?? customer.created_at;
      const tenureMonths = tenureAnchor ? monthsBetween(tenureAnchor) : 0;

      const invoices = invoicesByCustomer.get(customer.id) ?? [];
      let outstandingAr = 0;
      let overdueAr = 0;
      let openInvoiceCount = 0;
      let disputeCount = 0;
      let settled = 0;
      let onTime = 0;

      for (const invoice of invoices) {
        const remaining = Number(invoice.remaining_balance ?? 0);
        const paid = Number(invoice.amount_paid ?? 0);
        const disputed =
          invoice.dispute_status === true ||
          String(invoice.dispute_status ?? "").toLowerCase() === "true" ||
          String(invoice.dispute_status ?? "").toLowerCase() === "disputed";
        if (disputed) disputeCount += 1;

        if (isOpenInvoice(invoice)) {
          openInvoiceCount += 1;
          outstandingAr += remaining;
          if (invoice.due_date && invoice.due_date < today) overdueAr += remaining;
        }

        const settledInvoice = remaining <= 0.01 && paid > 0;
        if (settledInvoice && invoice.due_date) {
          settled += 1;
          const paidOn = latestPaymentDateByInvoice.get(invoice.id);
          if (paidOn && paidOn <= invoice.due_date) onTime += 1;
          else if (!paidOn) {
            // No application row — treat as unknown; don't count against on-time
            settled -= 1;
          }
        }
      }

      const customerPayments = paymentsByCustomer.get(customer.id) ?? [];
      const lifetimeCollected = customerPayments.reduce(
        (sum, p) => sum + Number(p.payment_amount ?? 0),
        0
      );
      const onTimePct = settled > 0 ? (onTime / settled) * 100 : null;
      const renewalCount = renewalsByCustomer.get(customer.id) ?? 0;
      const loyalty = scoreCustomerLoyalty({
        status: customer.status,
        tenureMonths,
        renewalCount,
        onTimePct,
        overdueAr,
        activeContracts: activeContracts.length,
      });

      return {
        id: customer.id,
        name: customer.name,
        industry: customer.industry,
        status: customer.status,
        credit_terms: customer.credit_terms,
        primary_contact: customer.primary_contact,
        contact_email: customer.contact_email,
        created_at: customer.created_at,
        activeContracts: activeContracts.length,
        mrr,
        tenureMonths,
        renewalCount,
        outstandingAr,
        overdueAr,
        openInvoiceCount,
        disputeCount,
        lifetimeCollected,
        paymentCount: customerPayments.length,
        onTimePct,
        loyalty,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function loyaltyLabel(tier: CustomerLoyaltyTier) {
  switch (tier) {
    case "loyal":
      return "Loyal";
    case "steady":
      return "Steady";
    case "at_risk":
      return "At risk";
    case "new":
      return "New";
    case "inactive":
      return "Inactive";
  }
}

export function formatTenureMonths(months: number) {
  if (months <= 0) return "—";
  if (months < 12) return `${months} mo`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem === 0 ? `${years} yr` : `${years} yr ${rem} mo`;
}
