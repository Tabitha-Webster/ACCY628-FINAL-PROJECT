import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { PageHeader, EmptyState, StatusBadge, Money, Hours, DateText, ErrorState } from "@/components/ui";
import type { Contract } from "@/lib/types";

export default async function MyContractsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "customer" || !profile.customer_id) redirect("/contracts");

  const supabase = await createClient();
  const { data: contracts, error } = await supabase
    .from("contracts")
    .select("*")
    .eq("customer_id", profile.customer_id)
    .order("start_date", { ascending: false });

  if (error) {
    return (
      <div>
        <PageHeader title="My Contracts" />
        <ErrorState message={error.message} />
      </div>
    );
  }

  const rows = (contracts ?? []) as Contract[];
  if (rows.length === 0) {
    return (
      <div>
        <PageHeader title="My Contracts" />
        <EmptyState title="No contracts on file" description="Contact your account manager to set up a service agreement." />
      </div>
    );
  }

  const contractIds = rows.map((c) => c.id);
  const { data: services } = await supabase
    .from("contract_services")
    .select("contract_id, service_name, service_description, is_included")
    .in("contract_id", contractIds);
  const servicesByContract = new Map<string, { service_name: string; service_description: string | null; is_included: boolean }[]>();
  for (const s of services ?? []) {
    const list = servicesByContract.get(s.contract_id) ?? [];
    list.push(s);
    servicesByContract.set(s.contract_id, list);
  }

  return (
    <div>
      <PageHeader title="My Contracts" description="Terms, included hours, and services covered under your service agreements." />

      <div className="max-w-3xl space-y-4">
        {rows.map((c) => (
          <div key={c.id} className="rounded-box border border-base-300 bg-base-100 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{c.name}</p>
                <p className="text-xs opacity-60">
                  {c.contract_number} · {c.contract_type.replace(/_/g, " ")}
                </p>
              </div>
              <StatusBadge status={c.status} />
            </div>

            {c.description ? <p className="mt-2 text-sm leading-relaxed opacity-80">{c.description}</p> : null}

            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-3">
                <dt className="opacity-60">Monthly Fee</dt>
                <dd className="font-medium">
                  <Money value={Number(c.monthly_recurring_fee)} />
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="opacity-60">Included Hours / Month</dt>
                <dd className="font-medium">
                  <Hours value={Number(c.included_hours_per_month)} />
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="opacity-60">Additional Hourly Rate</dt>
                <dd className="font-medium">
                  <Money value={Number(c.additional_hourly_rate)} />
                  /hr
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="opacity-60">Term</dt>
                <dd className="font-medium">
                  <DateText value={c.start_date} /> – {c.end_date ? <DateText value={c.end_date} /> : "Ongoing"}
                </dd>
              </div>
              {c.sla_response_hours != null ? (
                <div className="flex justify-between gap-3">
                  <dt className="opacity-60">SLA Response</dt>
                  <dd>{c.sla_response_hours} hrs</dd>
                </div>
              ) : null}
              {c.sla_resolution_hours != null ? (
                <div className="flex justify-between gap-3">
                  <dt className="opacity-60">SLA Resolution</dt>
                  <dd>{c.sla_resolution_hours} hrs</dd>
                </div>
              ) : null}
              {c.payment_terms ? (
                <div className="flex justify-between gap-3">
                  <dt className="opacity-60">Payment Terms</dt>
                  <dd>{c.payment_terms}</dd>
                </div>
              ) : null}
              {c.billing_frequency ? (
                <div className="flex justify-between gap-3">
                  <dt className="opacity-60">Billing Frequency</dt>
                  <dd className="capitalize">{c.billing_frequency.replace(/_/g, " ")}</dd>
                </div>
              ) : null}
            </dl>

            {servicesByContract.get(c.id)?.length ? (
              <div className="mt-3 border-t border-base-300 pt-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-60">Services</p>
                <ul className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
                  {servicesByContract.get(c.id)!.map((s) => (
                    <li key={s.service_name} className="flex items-center gap-2 text-sm">
                      <span className={`badge badge-xs ${s.is_included ? "badge-success" : "badge-ghost"}`} />
                      {s.service_name}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
