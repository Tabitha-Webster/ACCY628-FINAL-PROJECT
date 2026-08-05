import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";
import { PageHeader, StatCard, DataTable, EmptyState, ErrorState, StatusBadge, Money, DateText } from "@/components/ui";
import { CsvExportButton } from "@/components/CsvExportButton";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export default async function AdminRenewalsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const now = Date.now();

  const { data: contracts, error } = await supabase
    .from("contracts")
    .select(
      "id, contract_number, name, status, start_date, end_date, monthly_recurring_fee, payment_terms, billing_frequency, renewal_type, customers(id, name)"
    )
    .order("end_date", { ascending: true });

  if (error) {
    return (
      <div>
        <PageHeader title="Contract Renewals" />
        <ErrorState message={error.message} />
      </div>
    );
  }

  const rows = contracts ?? [];

  const endingSoon = rows.filter((c) => {
    if (!c.end_date || c.status === "canceled") return false;
    const end = new Date(c.end_date).getTime();
    return !Number.isNaN(end) && end >= now && end - now <= NINETY_DAYS_MS;
  });

  const pastEnd = rows.filter((c) => {
    if (!c.end_date) return false;
    const end = new Date(c.end_date).getTime();
    return !Number.isNaN(end) && end < now && ["active", "on_hold", "pending_approval"].includes(c.status);
  });

  const onHold = rows.filter((c) => c.status === "on_hold");
  const missingTerms = rows.filter(
    (c) => c.status === "active" && (!c.payment_terms || !c.billing_frequency)
  );

  function customerOf(c: (typeof rows)[0]) {
    return Array.isArray(c.customers) ? c.customers[0] : c.customers;
  }

  const focusList = [...endingSoon, ...pastEnd, ...onHold].filter(
    (c, i, arr) => arr.findIndex((x) => x.id === c.id) === i
  );

  const csvRows = focusList.map((c) => {
    const customer = customerOf(c);
    return [
      c.contract_number,
      c.name,
      customer?.name ?? "",
      c.status,
      c.start_date,
      c.end_date ?? "",
      c.monthly_recurring_fee ?? 0,
      c.payment_terms ?? "",
      c.billing_frequency ?? "",
      c.renewal_type ?? "",
    ];
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Contract Renewals"
        description="Contracts ending within 90 days, past end date while still open, on hold, or missing billing terms."
        actions={
          <div className="flex flex-wrap gap-2">
            <CsvExportButton
              filename="contract-renewals"
              headers={[
                "Contract #",
                "Name",
                "Customer",
                "Status",
                "Start",
                "End",
                "Monthly fee",
                "Payment terms",
                "Billing frequency",
                "Renewal type",
              ]}
              rows={csvRows}
            />
            <Link href="/contracts" className="btn btn-sm btn-outline">
              All contracts
            </Link>
            <Link href="/admin" className="btn btn-sm btn-ghost">
              Admin
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Ending ≤ 90 days" value={String(endingSoon.length)} tone={endingSoon.length ? "warning" : "success"} />
        <StatCard label="Past end date" value={String(pastEnd.length)} tone={pastEnd.length ? "error" : "success"} />
        <StatCard label="On hold" value={String(onHold.length)} tone={onHold.length ? "warning" : "default"} />
        <StatCard label="Missing terms" value={String(missingTerms.length)} tone={missingTerms.length ? "warning" : "success"} />
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-60">Renewal focus list</h2>
        {focusList.length === 0 ? (
          <EmptyState title="No renewals needing attention" description="Active contracts are within term and not on hold." />
        ) : (
          <DataTable headers={["Contract", "Customer", "Status", "End date", "Monthly", "Flags", ""]}>
            {focusList.map((c) => {
              const customer = customerOf(c);
              const end = c.end_date ? new Date(c.end_date).getTime() : NaN;
              const flags: string[] = [];
              if (!Number.isNaN(end) && end < now) flags.push("Past end");
              else if (!Number.isNaN(end) && end - now <= NINETY_DAYS_MS) flags.push("Ends soon");
              if (c.status === "on_hold") flags.push("On hold");
              if (!c.payment_terms) flags.push("No payment terms");
              if (!c.billing_frequency) flags.push("No billing frequency");

              return (
                <tr key={c.id}>
                  <td>
                    <Link href={`/contracts/${c.id}`} className="link link-hover font-medium">
                      {c.name}
                    </Link>
                    <div className="text-xs opacity-60">{c.contract_number}</div>
                  </td>
                  <td>
                    {customer ? (
                      <Link href={`/customers/${customer.id}`} className="link link-hover">
                        {customer.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <StatusBadge status={c.status} />
                  </td>
                  <td>
                    <DateText value={c.end_date} />
                  </td>
                  <td>
                    <Money value={Number(c.monthly_recurring_fee ?? 0)} />
                  </td>
                  <td className="text-xs opacity-80">{flags.join(" · ") || "—"}</td>
                  <td>
                    <Link href={`/contracts/${c.id}`} className="btn btn-ghost btn-xs">
                      Open
                    </Link>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        )}
      </section>

      {missingTerms.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-60">
            Active contracts missing terms ({missingTerms.length})
          </h2>
          <ul className="space-y-2">
            {missingTerms.map((c) => {
              const customer = customerOf(c);
              return (
                <li key={c.id} className="rounded-box border border-base-300 bg-base-100 px-4 py-3 text-sm">
                  <Link href={`/contracts/${c.id}`} className="link link-hover font-medium">
                    {c.name}
                  </Link>
                  <span className="opacity-60">
                    {" "}
                    · {customer?.name ?? "—"} ·{" "}
                    {!c.payment_terms ? "missing payment terms" : ""}
                    {!c.payment_terms && !c.billing_frequency ? " · " : ""}
                    {!c.billing_frequency ? "missing billing frequency" : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
