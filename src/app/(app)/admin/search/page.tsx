import Link from "next/link";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";
import { PageHeader, EmptyState, StatusBadge } from "@/components/ui";
import { PAGE_PERMISSION_CATALOG } from "@/lib/role-permissions";
import { roleLabel, type UserRole } from "@/lib/constants";

type SearchParams = Promise<{ q?: string }>;

function textMatches(value: unknown, query: string) {
  if (value == null) return false;
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return text.toLowerCase().includes(query.toLowerCase());
}

function auditValue(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (row[key] != null && row[key] !== "") return String(row[key]);
  }
  return "—";
}

export default async function AdminSearchPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const { q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim();

  if (!q) {
    return (
      <div>
        <PageHeader
          title="Global Search"
          description="Find access, configuration, and business records when diagnosing permission or data issues."
          actions={
            <Link href="/admin" className="btn btn-sm btn-outline">
              Back to Home
            </Link>
          }
        />
        <SearchForm defaultValue="" />
        <div className="grid gap-4 md:grid-cols-2">
          <SearchScope
            title="Access diagnosis"
            items={["User name or email", "C2C role", "Page permission", "Audit actor or action"]}
          />
          <SearchScope
            title="Data diagnosis"
            items={["Record ID", "Customer", "Contract or invoice number", "Payment reference", "Ticket"]}
          />
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const safe = q.replace(/[%_,."'\\]/g, " ").replace(/\s+/g, " ").trim();
  const pattern = `%${safe}%`;
  const quoted = `"${pattern}"`;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(q);

  const [
    usersRes,
    permissionsRes,
    customersRes,
    ticketsRes,
    contractsRes,
    invoicesRes,
    paymentsRes,
    auditRes,
  ] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, role, is_active").limit(1000),
    supabase
      .from("role_page_permissions")
      .select("role, page_key, can_view, updated_at, updated_by")
      .limit(1000),
    uuid
      ? supabase
          .from("customers")
          .select("id, name, status, contact_email, primary_contact")
          .eq("id", q)
      : supabase
          .from("customers")
          .select("id, name, status, contact_email, primary_contact")
          .or(`name.ilike.${quoted},contact_email.ilike.${quoted},primary_contact.ilike.${quoted}`)
          .limit(25),
    uuid
      ? supabase
          .from("support_tickets")
          .select("id, ticket_number, title, status, priority, customers(name)")
          .eq("id", q)
      : supabase
          .from("support_tickets")
          .select("id, ticket_number, title, status, priority, customers(name)")
          .or(`ticket_number.ilike.${quoted},title.ilike.${quoted}`)
          .limit(25),
    uuid
      ? supabase
          .from("contracts")
          .select("id, contract_number, name, status, billing_frequency, payment_terms, customers(name)")
          .eq("id", q)
      : supabase
          .from("contracts")
          .select("id, contract_number, name, status, billing_frequency, payment_terms, customers(name)")
          .or(`contract_number.ilike.${quoted},name.ilike.${quoted}`)
          .limit(25),
    uuid
      ? supabase
          .from("invoices")
          .select("id, invoice_number, status, remaining_balance, contract_id, customer_id, customers(name)")
          .eq("id", q)
      : supabase
          .from("invoices")
          .select("id, invoice_number, status, remaining_balance, contract_id, customer_id, customers(name)")
          .ilike("invoice_number", pattern)
          .limit(25),
    uuid
      ? supabase
          .from("payments")
          .select("id, payment_number, payment_date, payment_amount, reference_number, customer_id")
          .eq("id", q)
      : supabase
          .from("payments")
          .select("id, payment_number, payment_date, payment_amount, reference_number, customer_id")
          .or(`payment_number.ilike.${quoted},reference_number.ilike.${quoted}`)
          .limit(25),
    supabase
      .from("system_audit_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const pageByKey = new Map(PAGE_PERMISSION_CATALOG.map((page) => [page.key, page]));

  const users = (usersRes.data ?? []).filter((user) =>
    [user.id, user.full_name, user.email, user.role, user.is_active ? "active" : "inactive"].some(
      (value) => textMatches(value, q)
    )
  );

  const permissions = (permissionsRes.data ?? []).filter((permission) => {
    const page = pageByKey.get(permission.page_key);
    return [
      permission.role,
      permission.page_key,
      page?.label,
      page?.group,
      page?.description,
      permission.can_view ? "allowed enabled view" : "blocked disabled",
    ].some((value) => textMatches(value, q));
  });

  const auditRows = ((auditRes.data ?? []) as Record<string, unknown>[]).filter((row) =>
    Object.values(row).some((value) => textMatches(value, q))
  );

  const customers = customersRes.data ?? [];
  const tickets = ticketsRes.data ?? [];
  const contracts = contractsRes.data ?? [];
  const invoices = invoicesRes.data ?? [];
  const payments = paymentsRes.data ?? [];
  const total =
    users.length +
    permissions.length +
    auditRows.length +
    customers.length +
    tickets.length +
    contracts.length +
    invoices.length +
    payments.length;

  const sourceErrors = [
    ["Users", usersRes.error],
    ["Role permissions", permissionsRes.error],
    ["Customers", customersRes.error],
    ["Tickets", ticketsRes.error],
    ["Contracts", contractsRes.error],
    ["Invoices", invoicesRes.error],
    ["Payments", paymentsRes.error],
    ["Audit logs", auditRes.error],
  ].filter((entry) => entry[1]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Global Search"
        description={`${total} diagnostic record${total === 1 ? "" : "s"} found for “${q}”.`}
        actions={
          <Link href="/admin" className="btn btn-sm btn-outline">
            Back to Home
          </Link>
        }
      />
      <SearchForm defaultValue={q} />

      {sourceErrors.length > 0 ? (
        <div className="alert alert-warning text-sm">
          <div>
            <p className="font-semibold">Some record sources could not be searched.</p>
            <ul className="mt-1 list-disc pl-5">
              {sourceErrors.map(([source, error]) => (
                <li key={String(source)}>
                  {String(source)}: {(error as { message: string }).message}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {total === 0 ? (
        <EmptyState
          title="No matching diagnostic records"
          description="Try a full record ID, email address, page name, contract number, invoice number, or payment reference."
        />
      ) : null}

      {users.length > 0 ? (
        <ResultSection title="Users & access">
          {users.map((user) => (
            <ResultCard
              key={user.id}
              href="/admin/users"
              title={user.full_name}
              badge={user.is_active ? "Active" : "Inactive"}
              detail={`${user.email} · ${roleLabel(user.role as UserRole)} · ID ${user.id}`}
            />
          ))}
        </ResultSection>
      ) : null}

      {permissions.length > 0 ? (
        <ResultSection title="Role permissions">
          {permissions.map((permission) => {
            const page = pageByKey.get(permission.page_key);
            return (
              <ResultCard
                key={`${permission.role}:${permission.page_key}`}
                href="/admin/role-permissions"
                title={`${roleLabel(permission.role as UserRole)} → ${page?.label ?? permission.page_key}`}
                badge={permission.can_view ? "Allowed" : "Blocked"}
                detail={`${page?.group ?? "Unknown module"} · key ${permission.page_key}`}
              />
            );
          })}
        </ResultSection>
      ) : null}

      {auditRows.length > 0 ? (
        <ResultSection title="System change audit">
          {auditRows.map((row, index) => (
            <ResultCard
              key={String(row.id ?? index)}
              href="/admin/audit"
              title={`${auditValue(row, ["action", "event_type", "activity"])} · ${auditValue(row, [
                "entity_type",
                "table_name",
                "resource",
              ])}`}
              badge="Audit"
              detail={`${auditValue(row, [
                "actor_email",
                "actor_id",
                "user_id",
                "performed_by",
              ])} · ${auditValue(row, ["created_at", "event_at", "logged_at", "timestamp"])}`}
            />
          ))}
        </ResultSection>
      ) : null}

      {customers.length > 0 ? (
        <ResultSection title="Customers">
          {customers.map((customer) => (
            <ResultCard
              key={customer.id}
              href={`/customers/${customer.id}`}
              title={customer.name}
              badge={customer.status}
              detail={`${customer.primary_contact ?? "No primary contact"} · ${
                customer.contact_email ?? "No contact email"
              } · ID ${customer.id}`}
            />
          ))}
        </ResultSection>
      ) : null}

      {contracts.length > 0 ? (
        <ResultSection title="Contracts & billing configuration">
          {contracts.map((contract) => {
            const customer = Array.isArray(contract.customers)
              ? contract.customers[0]
              : contract.customers;
            const config =
              contract.billing_frequency && contract.payment_terms
                ? `${contract.billing_frequency} · ${contract.payment_terms}`
                : "Billing configuration incomplete";
            return (
              <ResultCard
                key={contract.id}
                href={`/contracts/${contract.id}`}
                title={`${contract.contract_number} · ${contract.name}`}
                badge={contract.status}
                detail={`${customer?.name ?? "No customer"} · ${config} · ID ${contract.id}`}
              />
            );
          })}
        </ResultSection>
      ) : null}

      {invoices.length > 0 ? (
        <ResultSection title="Invoices & record links">
          {invoices.map((invoice) => {
            const customer = Array.isArray(invoice.customers) ? invoice.customers[0] : invoice.customers;
            return (
              <ResultCard
                key={invoice.id}
                href={`/invoices/${invoice.id}`}
                title={invoice.invoice_number}
                badge={invoice.status}
                detail={`${customer?.name ?? "No customer"} · contract ${
                  invoice.contract_id ?? "not linked"
                } · balance ${Number(invoice.remaining_balance ?? 0).toFixed(2)} · ID ${invoice.id}`}
              />
            );
          })}
        </ResultSection>
      ) : null}

      {payments.length > 0 ? (
        <ResultSection title="Payments">
          {payments.map((payment) => (
            <ResultCard
              key={payment.id}
              href="/payments"
              title={payment.payment_number}
              badge="Payment"
              detail={`${payment.payment_date} · ${Number(payment.payment_amount).toFixed(2)} · reference ${
                payment.reference_number ?? "none"
              } · customer ${payment.customer_id} · ID ${payment.id}`}
            />
          ))}
        </ResultSection>
      ) : null}

      {tickets.length > 0 ? (
        <ResultSection title="Support records">
          {tickets.map((ticket) => {
            const customer = Array.isArray(ticket.customers) ? ticket.customers[0] : ticket.customers;
            return (
              <ResultCard
                key={ticket.id}
                href={`/tickets/${ticket.id}`}
                title={`${ticket.ticket_number} · ${ticket.title}`}
                badge={ticket.status}
                detail={`${customer?.name ?? "No customer"} · ${ticket.priority} · ID ${ticket.id}`}
              />
            );
          })}
        </ResultSection>
      ) : null}
    </div>
  );
}

function SearchForm({ defaultValue }: { defaultValue: string }) {
  return (
    <form className="mb-6 flex flex-wrap gap-2" action="/admin/search" method="get">
      <input
        name="q"
        defaultValue={defaultValue}
        className="input input-bordered min-w-[16rem] flex-1"
        placeholder="User, email, role, page, record ID, contract, invoice, payment…"
        autoFocus
      />
      <button type="submit" className="btn btn-primary">
        Search records
      </button>
    </form>
  );
}

function SearchScope({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-box border border-base-300 bg-base-100 p-5">
      <p className="font-semibold">{title}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm opacity-70">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function ResultCard({
  href,
  title,
  badge,
  detail,
}: {
  href: string;
  title: string;
  badge: string;
  detail: string;
}) {
  return (
    <li className="rounded-box border border-base-300 bg-base-100 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={href} className="font-medium link link-hover">
          {title}
        </Link>
        <StatusBadge status={badge} />
      </div>
      <p className="mt-1 break-all text-xs opacity-60">{detail}</p>
    </li>
  );
}

function ResultSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-60">{title}</h2>
      <ul className="space-y-2">{children}</ul>
    </section>
  );
}
