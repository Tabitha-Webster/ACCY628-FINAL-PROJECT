import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, requireApprovedCustomer } from "@/lib/auth";
import { CONTRACTS_NAV_COPY } from "@/lib/constants";
import { PageHeader, EmptyState, StatusBadge, Money, Hours, DateText, ErrorState } from "@/components/ui";
import type { Contract, ContractService } from "@/lib/types";
import { listContractServices, listCustomerContracts, unwrapAssignedManager, billedMonthlyRecurringFee } from "@/lib/contracts";
import type { ContractSignaturePacket } from "@/lib/contracts/signature-packets";
import { CustomerContractSignaturePanel } from "@/components/CustomerContractSignaturePanel";
import { CustomerContractPdfActions } from "@/components/CustomerContractPdfActions";

function toPdfContract(c: Contract) {
  return {
    id: c.id,
    customer_id: c.customer_id,
    contract_number: c.contract_number,
    name: c.name,
    status: c.status,
    contract_type: c.contract_type,
    start_date: c.start_date,
    end_date: c.end_date,
    monthly_recurring_fee: c.monthly_recurring_fee,
    work_location: c.work_location,
    included_hours_per_month: c.included_hours_per_month,
    additional_hourly_rate: c.additional_hourly_rate,
    payment_terms: c.payment_terms,
    billing_frequency: c.billing_frequency,
    sla_response_hours: c.sla_response_hours,
    sla_resolution_hours: c.sla_resolution_hours,
    description: c.description,
    scope: c.scope,
    included_services: c.included_services,
  };
}

export default async function MyContractsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "customer" || !profile.customer_id) redirect("/contracts");
  await requireApprovedCustomer(profile);

  const copy = CONTRACTS_NAV_COPY.customer;
  const supabase = await createClient();
  const [{ data: contracts, error }, { data: customerRow }] = await Promise.all([
    listCustomerContracts(supabase, profile.customer_id),
    supabase.from("customers").select("name").eq("id", profile.customer_id).maybeSingle(),
  ]);

  if (error) {
    return (
      <div>
        <PageHeader title={copy.title} />
        <ErrorState message={error.message} />
      </div>
    );
  }

  const customerName = customerRow?.name?.trim() || profile.full_name;
  const rows = (contracts ?? []) as Array<
    Contract & {
      assigned_manager?: { full_name: string } | { full_name: string }[] | null;
    }
  >;
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

  const contractIds = rows.map((c) => c.id);
  const [{ data: services }, packetsRes] = await Promise.all([
    listContractServices(supabase, contractIds),
    supabase
      .from("contract_signature_packets")
      .select("*")
      .in("contract_id", contractIds)
      .eq("is_current", true),
  ]);

  const servicesByContract = new Map<string, ContractService[]>();
  for (const s of (services ?? []) as ContractService[]) {
    const list = servicesByContract.get(s.contract_id) ?? [];
    list.push(s);
    servicesByContract.set(s.contract_id, list);
  }

  const packetByContract = new Map<string, ContractSignaturePacket>();
  for (const packet of (packetsRes.data ?? []) as ContractSignaturePacket[]) {
    packetByContract.set(packet.contract_id, packet);
  }

  return (
    <div>
      <PageHeader title={copy.title} description={copy.description} />

      <div className="max-w-3xl space-y-4">
        {rows.map((c) => {
          const packet = packetByContract.get(c.id) ?? null;
          const needsSignature = packet?.status === "awaiting_customer";
          const managerName = unwrapAssignedManager(c)?.full_name ?? null;
          const pdfContract = toPdfContract(c);
          return (
            <div key={c.id} className="rounded-box border border-base-300 bg-base-100 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-xs opacity-60">
                    {c.contract_number} · {c.contract_type.replace(/_/g, " ")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={c.status} />
                  {needsSignature ? (
                    <StatusBadge status="awaiting_customer" label="Sign to activate" />
                  ) : null}
                </div>
              </div>

              {c.status === "pending_approval" && !needsSignature ? (
                <p className="mt-3 text-sm opacity-70">
                  This agreement is awaiting ServiceSync signatures and is not active yet. When it is
                  ready for you, you will be asked to sign and accept it here.
                </p>
              ) : null}

              {needsSignature ? (
                <p className="mt-3 text-sm opacity-70">
                  Your account manager and executive have signed. Review the agreement below, then
                  sign and accept to activate it.
                </p>
              ) : null}

              {c.status !== "pending_approval" ? (
                <CustomerContractPdfActions
                  className="mt-3"
                  contract={pdfContract}
                  customerName={customerName}
                  managerName={managerName}
                  packet={packet}
                />
              ) : null}

              {c.description ? (
                <p className="mt-2 text-sm leading-relaxed opacity-80">{c.description}</p>
              ) : null}

              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <div className="flex justify-between gap-3">
                  <dt className="opacity-60">Monthly Fee</dt>
                  <dd className="font-medium">
                    <Money value={billedMonthlyRecurringFee(c)} />
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
                    <DateText value={c.start_date} /> –{" "}
                    {c.end_date ? <DateText value={c.end_date} /> : "Ongoing"}
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
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-60">
                    Services
                  </p>
                  <ul className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
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

              {packet &&
              (packet.status === "awaiting_customer" || packet.status === "fully_executed") ? (
                <CustomerContractSignaturePanel
                  contract={pdfContract}
                  customerName={customerName}
                  managerName={managerName}
                  profileId={profile.id}
                  profileName={profile.full_name}
                  packet={packet}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
