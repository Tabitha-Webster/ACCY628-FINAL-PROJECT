import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, requireApprovedCustomer } from "@/lib/auth";
import { CONTRACTS_NAV_COPY } from "@/lib/constants";
import { PageHeader, EmptyState, StatusBadge, Money, Hours, DateText, ErrorState } from "@/components/ui";
import type { Contract, ContractService } from "@/lib/types";
import { listContractServices, listCustomerContracts } from "@/lib/contracts";

export default async function MyContractsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "customer" || !profile.customer_id) redirect("/contracts");
  await requireApprovedCustomer(profile);

  const copy = CONTRACTS_NAV_COPY.customer;
  const supabase = await createClient();
  const { data: contracts, error } = await listCustomerContracts(supabase, profile.customer_id);

  if (error) {
    return (
      <div>
        <PageHeader title={copy.title} />
        <ErrorState message={error.message} />
      </div>
    );
  }

  const rows = (contracts ?? []) as Contract[];
  if (rows.length === 0) {
    return (
      <div>
        <PageHeader title={copy.title} description={copy.description} />
        <EmptyState
          title="No contracts on file"
          description="Contact your account manager to set up a service agreement."
        />
      </div>
    );
  }

  const { data: services } = await listContractServices(
    supabase,
    rows.map((c) => c.id)
  );
  const servicesByContract = new Map<string, ContractService[]>();
  for (const s of (services ?? []) as ContractService[]) {
    const list = servicesByContract.get(s.contract_id) ?? [];
    list.push(s);
    servicesByContract.set(s.contract_id, list);
  }

  return (
    <div>
      <PageHeader title={copy.title} description={copy.description} />

      <div className="space-y-6">
        {rows.map((c) => (
          <div key={c.id} className="rounded-box border border-base-300 bg-base-100 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">{c.name}</p>
                <p className="text-sm opacity-60">
                  {c.contract_number} · {c.contract_type.replace(/_/g, " ")}
                </p>
              </div>
              <StatusBadge status={c.status} />
            </div>

            {c.description ? (
              <p className="mt-3 text-sm leading-relaxed opacity-80">{c.description}</p>
            ) : null}

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs uppercase tracking-wide opacity-60">Monthly Fee</p>
                <p className="mt-1 font-medium">
                  <Money value={Number(c.monthly_recurring_fee)} />
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide opacity-60">Included Hours / Month</p>
                <p className="mt-1 font-medium">
                  <Hours value={Number(c.included_hours_per_month)} />
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide opacity-60">Additional Hourly Rate</p>
                <p className="mt-1 font-medium">
                  <Money value={Number(c.additional_hourly_rate)} />
                  /hr
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide opacity-60">Term</p>
                <p className="mt-1 font-medium">
                  <DateText value={c.start_date} /> –{" "}
                  {c.end_date ? <DateText value={c.end_date} /> : "Ongoing"}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {c.sla_response_hours != null ? (
                <div>
                  <p className="text-xs uppercase tracking-wide opacity-60">SLA Response</p>
                  <p className="mt-1">{c.sla_response_hours} hrs</p>
                </div>
              ) : null}
              {c.sla_resolution_hours != null ? (
                <div>
                  <p className="text-xs uppercase tracking-wide opacity-60">SLA Resolution</p>
                  <p className="mt-1">{c.sla_resolution_hours} hrs</p>
                </div>
              ) : null}
              {c.payment_terms ? (
                <div>
                  <p className="text-xs uppercase tracking-wide opacity-60">Payment Terms</p>
                  <p className="mt-1">{c.payment_terms}</p>
                </div>
              ) : null}
              {c.billing_frequency ? (
                <div>
                  <p className="text-xs uppercase tracking-wide opacity-60">Billing Frequency</p>
                  <p className="mt-1 capitalize">{c.billing_frequency.replace(/_/g, " ")}</p>
                </div>
              ) : null}
            </div>

            {servicesByContract.get(c.id)?.length ? (
              <div className="mt-4 border-t border-base-300 pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-60">
                  Services
                </p>
                <ul className="grid gap-1 sm:grid-cols-2">
                  {servicesByContract.get(c.id)!.map((s) => (
                    <li key={s.id ?? s.service_name} className="flex items-center gap-2 text-sm">
                      <span
                        className={`badge badge-xs ${s.is_included ? "badge-success" : "badge-ghost"}`}
                      />
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
