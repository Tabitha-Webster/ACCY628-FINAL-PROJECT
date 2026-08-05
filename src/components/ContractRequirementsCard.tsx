import Link from "next/link";
import { Hours, Money } from "@/components/ui";

export type ContractRequirements = {
  id: string;
  name: string;
  contract_number: string;
  scope?: string | null;
  included_services?: string | null;
  excluded_services?: string | null;
  included_hours_per_month: number;
  additional_hourly_rate?: number | null;
  sla_response_hours?: number | null;
  sla_resolution_hours?: number | null;
};

type Props = {
  contract: ContractRequirements | null;
};

export function ContractRequirementsCard({ contract }: Props) {
  if (!contract) {
    return (
      <div className="rounded-box border border-base-300 bg-base-100 p-4 text-sm">
        <p className="font-semibold">Contract Requirements</p>
        <p className="mt-2 opacity-60">No contract is linked to this work.</p>
      </div>
    );
  }

  return (
    <div className="rounded-box border border-base-300 bg-base-100 p-4 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">Contract Requirements</p>
          <p className="mt-1 text-xs opacity-60">
            {contract.contract_number} · {contract.name}
          </p>
        </div>
        <Link href={`/contracts/${contract.id}`} className="btn btn-ghost btn-xs">
          View full contract
        </Link>
      </div>

      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide opacity-50">Included Hours / Month</dt>
          <dd className="mt-0.5">
            <Hours value={Number(contract.included_hours_per_month)} />
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide opacity-50">Additional Hourly Rate</dt>
          <dd className="mt-0.5">
            {contract.additional_hourly_rate != null ? <Money value={Number(contract.additional_hourly_rate)} /> : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide opacity-50">SLA Response</dt>
          <dd className="mt-0.5">{contract.sla_response_hours != null ? `${contract.sla_response_hours} hrs` : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide opacity-50">SLA Resolution</dt>
          <dd className="mt-0.5">{contract.sla_resolution_hours != null ? `${contract.sla_resolution_hours} hrs` : "—"}</dd>
        </div>
      </dl>

      {contract.scope ? (
        <div className="mt-3">
          <p className="text-xs uppercase tracking-wide opacity-50">Scope</p>
          <p className="mt-1 leading-relaxed">{contract.scope}</p>
        </div>
      ) : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-wide opacity-50">Included Services</p>
          <p className="mt-1 leading-relaxed">{contract.included_services ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide opacity-50">Excluded Services</p>
          <p className="mt-1 leading-relaxed">{contract.excluded_services ?? "—"}</p>
        </div>
      </div>
    </div>
  );
}
