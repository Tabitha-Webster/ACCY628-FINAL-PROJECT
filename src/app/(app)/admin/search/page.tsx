import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";
import { PageHeader, EmptyState, ErrorState, StatusBadge } from "@/components/ui";

type SearchParams = Promise<{ q?: string }>;

export default async function AdminSearchPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const { q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim();
  const supabase = await createClient();

  if (!q) {
    return (
      <div>
        <PageHeader
          title="Global Admin Search"
          description="Search users, customers, tickets, contracts, and invoices from one place."
          actions={
            <Link href="/admin" className="btn btn-sm btn-outline">
              Admin
            </Link>
          }
        />
        <SearchForm defaultValue="" />
        <EmptyState title="Enter a search term" description="Try a name, email, ticket number, or invoice number." />
      </div>
    );
  }

  const safe = q.replace(/[%_,."'\\]/g, " ").replace(/\s+/g, " ").trim();
  const pattern = `%${safe}%`;
  const quoted = `"${pattern}"`;

  const [usersRes, customersRes, ticketsRes, contractsRes, invoicesRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, role, is_active")
      .or(`full_name.ilike.${quoted},email.ilike.${quoted}`)
      .limit(15),
    supabase
      .from("customers")
      .select("id, name, status, contact_email, primary_contact")
      .or(`name.ilike.${quoted},contact_email.ilike.${quoted},primary_contact.ilike.${quoted}`)
      .limit(15),
    supabase
      .from("support_tickets")
      .select("id, ticket_number, title, status, priority, customers(name)")
      .or(`ticket_number.ilike.${quoted},title.ilike.${quoted}`)
      .limit(15),
    supabase
      .from("contracts")
      .select("id, contract_number, name, status, customers(name)")
      .or(`contract_number.ilike.${quoted},name.ilike.${quoted}`)
      .limit(15),
    supabase
      .from("invoices")
      .select("id, invoice_number, status, remaining_balance, customers(name)")
      .ilike("invoice_number", pattern)
      .limit(15),
  ]);

  const error =
    usersRes.error ||
    customersRes.error ||
    ticketsRes.error ||
    contractsRes.error ||
    invoicesRes.error;

  const users = usersRes.data ?? [];
  const customers = customersRes.data ?? [];
  const tickets = ticketsRes.data ?? [];
  const contracts = contractsRes.data ?? [];
  const invoices = invoicesRes.data ?? [];
  const total = users.length + customers.length + tickets.length + contracts.length + invoices.length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Global Admin Search"
        description={`${total} result${total === 1 ? "" : "s"} for “${q}”.`}
        actions={
          <Link href="/admin" className="btn btn-sm btn-outline">
            Admin
          </Link>
        }
      />
      <SearchForm defaultValue={q} />
      {error ? <ErrorState message={error.message} /> : null}

      {!error && total === 0 ? (
        <EmptyState title="No matches" description="Try a shorter fragment or a different identifier." />
      ) : null}

      {users.length > 0 ? (
        <ResultSection title="Users">
          {users.map((u) => (
            <li key={u.id} className="rounded-box border border-base-300 bg-base-100 px-4 py-3">
              <Link href="/admin/users" className="font-medium link link-hover">
                {u.full_name}
              </Link>
              <p className="text-xs opacity-60">
                {u.email} · {u.role} · {u.is_active ? "active" : "inactive"}
              </p>
            </li>
          ))}
        </ResultSection>
      ) : null}

      {customers.length > 0 ? (
        <ResultSection title="Customers">
          {customers.map((c) => (
            <li key={c.id} className="rounded-box border border-base-300 bg-base-100 px-4 py-3">
              <Link href={`/customers/${c.id}`} className="font-medium link link-hover">
                {c.name}
              </Link>
              <p className="text-xs opacity-60">
                <StatusBadge status={c.status} /> · {c.primary_contact ?? "—"} · {c.contact_email ?? "—"}
              </p>
            </li>
          ))}
        </ResultSection>
      ) : null}

      {tickets.length > 0 ? (
        <ResultSection title="Tickets">
          {tickets.map((t) => {
            const customer = Array.isArray(t.customers) ? t.customers[0] : t.customers;
            return (
              <li key={t.id} className="rounded-box border border-base-300 bg-base-100 px-4 py-3">
                <Link href={`/tickets/${t.id}`} className="font-medium link link-hover">
                  {t.ticket_number}: {t.title}
                </Link>
                <p className="text-xs opacity-60">
                  {customer?.name ?? "—"} · <StatusBadge status={t.status} /> ·{" "}
                  <StatusBadge status={t.priority} />
                </p>
              </li>
            );
          })}
        </ResultSection>
      ) : null}

      {contracts.length > 0 ? (
        <ResultSection title="Contracts">
          {contracts.map((c) => {
            const customer = Array.isArray(c.customers) ? c.customers[0] : c.customers;
            return (
              <li key={c.id} className="rounded-box border border-base-300 bg-base-100 px-4 py-3">
                <Link href={`/contracts/${c.id}`} className="font-medium link link-hover">
                  {c.name}
                </Link>
                <p className="text-xs opacity-60">
                  {c.contract_number} · {customer?.name ?? "—"} · <StatusBadge status={c.status} />
                </p>
              </li>
            );
          })}
        </ResultSection>
      ) : null}

      {invoices.length > 0 ? (
        <ResultSection title="Invoices">
          {invoices.map((inv) => {
            const customer = Array.isArray(inv.customers) ? inv.customers[0] : inv.customers;
            return (
              <li key={inv.id} className="rounded-box border border-base-300 bg-base-100 px-4 py-3">
                <Link href={`/invoices/${inv.id}`} className="font-medium link link-hover">
                  {inv.invoice_number}
                </Link>
                <p className="text-xs opacity-60">
                  {customer?.name ?? "—"} · <StatusBadge status={inv.status} /> · balance{" "}
                  {Number(inv.remaining_balance ?? 0).toFixed(2)}
                </p>
              </li>
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
        placeholder="Search users, customers, tickets, contracts, invoices…"
        autoFocus
      />
      <button type="submit" className="btn btn-primary">
        Search
      </button>
    </form>
  );
}

function ResultSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-60">{title}</h2>
      <ul className="space-y-2">{children}</ul>
    </section>
  );
}
