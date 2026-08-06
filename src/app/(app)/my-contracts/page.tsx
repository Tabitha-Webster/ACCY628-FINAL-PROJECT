import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, requireApprovedCustomer } from "@/lib/auth";
import { CONTRACTS_NAV_COPY } from "@/lib/constants";
import { PageHeader, EmptyState, StatusBadge, Money, Hours, DateText, ErrorState } from "@/components/ui";
import type { Contract, ContractService, ContractStatus } from "@/lib/types";
import {
  listContractServices,
  listCustomerContracts,
  pdfContractFromRow,
  unwrapAssignedManager,
  billedMonthlyRecurringFee,
} from "@/lib/contracts";
import type { ContractSignaturePacket } from "@/lib/contracts/signature-packets";
import { CustomerContractSignaturePanel } from "@/components/CustomerContractSignaturePanel";
import { CustomerContractPdfActions } from "@/components/CustomerContractPdfActions";

function toPdfContract(c: Contract) {
  return {
    id: c.id,
    customer_id: c.customer_id,
    ...pdfContractFromRow(c),
  };
}

const COMPLETED_STATUSES: ContractStatus[] = ["expired", "renewed", "canceled"];

function isCompletedContract(status: ContractStatus) {
  return COMPLETED_STATUSES.includes(status);
}

function ContractCard({
  contract,
  services,
  customerName,
  managerName,
  profileId,
  profileName,
  packet,
}: {
  contract: Contract;
  services: ContractService[];
  customerName: string;
  managerName: string | null;
  profileId: string;
  profileName: string;
  packet: ContractSignaturePacket | null;
}) {
  const needsSignature = packet?.status === "awaiting_customer";
  const pdfContract = toPdfContract(contract);

  return (
    <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50/70 to-base-100 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-emerald-950">{contract.name}</p>
          <p className="text-xs opacity-60">
            {contract.contract_number} · {contract.contract_type.replace(/_/g, " ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={contract.status} />
          {needsSignature ? (
            <StatusBadge status="awaiting_customer" label="Sign to activate" />
          ) : null}
        </div>
      </div>

      {contract.status === "pending_approval" && !needsSignature ? (
        <p className="mt-3 text-sm opacity-70">
          This agreement is awaiting ServiceSync signatures and is not active yet. When it is ready
          for you, you will be asked to sign and accept it here.
        </p>
      ) : null}

      {needsSignature ? (
        <p className="mt-3 text-sm opacity-70">
          Your account manager and executive have signed. Review the agreement below, then sign and
          accept to activate it.
        </p>
      ) : null}

      {contract.status !== "pending_approval" ? (
        <CustomerContractPdfActions
          className="mt-3"
          contract={pdfContract}
          customerName={customerName}
          managerName={managerName}
          packet={packet}
        />
      ) : null}

      {contract.description ? (
        <p className="mt-2 text-sm leading-relaxed opacity-80">{contract.description}</p>
      ) : null}

      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-3">
          <dt className="opacity-60">Monthly Fee</dt>
          <dd className="font-medium">
            <Money value={billedMonthlyRecurringFee(contract)} />
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="opacity-60">Included Hours / Month</dt>
          <dd className="font-medium">
            <Hours value={Number(contract.included_hours_per_month)} />
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="opacity-60">Additional Hourly Rate</dt>
          <dd className="font-medium">
            <Money value={Number(contract.additional_hourly_rate)} />
            /hr
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="opacity-60">Term</dt>
          <dd className="font-medium">
            <DateText value={contract.start_date} /> –{" "}
            {contract.end_date ? <DateText value={contract.end_date} /> : "Ongoing"}
          </dd>
        </div>
        {contract.sla_response_hours != null ? (
          <div className="flex justify-between gap-3">
            <dt className="opacity-60">SLA Response</dt>
            <dd>{contract.sla_response_hours} hrs</dd>
          </div>
        ) : null}
        {contract.sla_resolution_hours != null ? (
          <div className="flex justify-between gap-3">
            <dt className="opacity-60">SLA Resolution</dt>
            <dd>{contract.sla_resolution_hours} hrs</dd>
          </div>
        ) : null}
        {contract.payment_terms ? (
          <div className="flex justify-between gap-3">
            <dt className="opacity-60">Payment Terms</dt>
            <dd>{contract.payment_terms}</dd>
          </div>
        ) : null}
        {contract.billing_frequency ? (
          <div className="flex justify-between gap-3">
            <dt className="opacity-60">Billing Frequency</dt>
            <dd className="capitalize">{contract.billing_frequency.replace(/_/g, " ")}</dd>
          </div>
        ) : null}
      </dl>

      {services.length ? (
        <div className="mt-3 border-t border-emerald-200/70 pt-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-900/70">
            Services
          </p>
          <ul className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
            {services.map((s) => (
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
          profileId={profileId}
          profileName={profileName}
          packet={packet}
        />
      ) : null}
    </div>
  );
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

  const current = rows.filter((c) => !isCompletedContract(c.status));
  const completed = rows.filter((c) => isCompletedContract(c.status));

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

  const profileId = profile.id;
  const profileName = profile.full_name;

  function renderCard(c: (typeof rows)[number]) {
    return (
      <ContractCard
        key={c.id}
        contract={c}
        services={servicesByContract.get(c.id) ?? []}
        customerName={customerName}
        managerName={unwrapAssignedManager(c)?.full_name ?? null}
        profileId={profileId}
        profileName={profileName}
        packet={packetByContract.get(c.id) ?? null}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={
          <Link href="/service-usage" className="btn btn-outline btn-sm border-emerald-300 text-emerald-900">
            Service Usage
          </Link>
        }
      />

      <div className="max-w-3xl space-y-8">
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-900/70">
              Current Contracts
            </h2>
            <span className="text-xs opacity-50">{current.length}</span>
          </div>
          {current.length === 0 ? (
            <EmptyState
              title="No current contracts"
              description="Your completed agreements are listed below."
            />
          ) : (
            current.map(renderCard)
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide opacity-70">
              Completed Contracts
            </h2>
            <span className="text-xs opacity-50">{completed.length}</span>
          </div>
          {completed.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-base-300 px-4 py-6 text-sm opacity-60">
              No completed contracts yet.
            </p>
          ) : (
            completed.map(renderCard)
          )}
        </section>
      </div>
    </div>
  );
}
