import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, requireApprovedCustomer } from "@/lib/auth";
import { CONTRACTS_NAV_COPY } from "@/lib/constants";
import { PageHeader, EmptyState, ErrorState } from "@/components/ui";
import type { Contract, ContractService } from "@/lib/types";
import { listContractServices, listCustomerContracts, unwrapAssignedManager } from "@/lib/contracts";
import type { ContractSignaturePacket } from "@/lib/contracts/signature-packets";
import {
  MyContractsListClient,
  type MyContractListItem,
} from "@/components/MyContractsListClient";

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

  const items: MyContractListItem[] = rows.map((c) => ({
    contract: c,
    services: servicesByContract.get(c.id) ?? [],
    managerName: unwrapAssignedManager(c)?.full_name ?? null,
    packet: packetByContract.get(c.id) ?? null,
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={
          <Link
            href="/service-usage"
            className="btn btn-outline btn-sm border-emerald-300 text-emerald-900"
          >
            Service Usage
          </Link>
        }
      />

      <MyContractsListClient
        items={items}
        customerName={customerName}
        profileId={profile.id}
        profileName={profile.full_name}
      />
    </div>
  );
}
