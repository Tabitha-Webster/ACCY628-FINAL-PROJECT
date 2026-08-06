import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  StatCard,
  StatusBadge,
} from "@/components/ui";
import { formatDate, formatDateTime, statusLabel } from "@/lib/format";
import {
  canRenewContracts,
  canViewContractsModule,
  daysUntilDate,
  isEligibleForAutoRenew,
  listContracts,
  listOpenRenewalReminders,
  listRecentContractRenewals,
  reminderBadgeClass,
  reminderKindLabel,
  syncRemindersForContracts,
  unwrapProfile,
  buildContractCalendarEvents,
  type ContractListRow,
  type ReminderKind,
} from "@/lib/contracts";
import { RenewalsActionsClient } from "@/components/RenewalsActionsClient";
import { ContractRenewalCalendar } from "@/components/ContractRenewalCalendar";

function unwrapJoin<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function ContractRenewalsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!canViewContractsModule(profile.role)) redirect("/dashboard");

  const canManage = canRenewContracts(profile.role);
  const supabase = await createClient();

  const { data: contractRows, error: contractsError } = await listContracts(supabase);
  const contracts = (contractRows ?? []) as ContractListRow[];

  if (!contractsError && contracts.length > 0) {
    await syncRemindersForContracts(
      supabase,
      contracts.map((c) => ({
        id: c.id,
        status: c.status,
        start_date: c.start_date,
        end_date: c.end_date,
        renewal_type: c.renewal_type,
      }))
    );
  }

  const [remindersResult, renewalsResult] = await Promise.all([
    listOpenRenewalReminders(supabase),
    listRecentContractRenewals(supabase, 30),
  ]);

  const openReminders = remindersResult.data ?? [];
  const recentRenewals = renewalsResult.data ?? [];
  const error = contractsError ?? remindersResult.error ?? renewalsResult.error;
  const calendarEvents = buildContractCalendarEvents(contracts, openReminders);

  const autoDue = contracts.filter((c) =>
    isEligibleForAutoRenew({
      id: c.id,
      status: c.status,
      start_date: c.start_date,
      end_date: c.end_date,
      renewal_type: c.renewal_type,
    })
  );

  const reminder90 = openReminders.filter((r) => r.reminder_kind === "renewal_90").length;
  const reminder60 = openReminders.filter((r) => r.reminder_kind === "renewal_60").length;
  const reminder30 = openReminders.filter((r) => r.reminder_kind === "renewal_30").length;
  const expirationWarnings = openReminders.filter(
    (r) => r.reminder_kind === "expiration_warning" || r.reminder_kind === "expired"
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Renewal & Expiration"
        description="Automatic 90 / 60 / 30-day renewal reminders, expiration warnings, auto-renew processing, and renewal history."
      />

      {error ? <ErrorState message={error.message} /> : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="90-day reminders" value={String(reminder90)} />
        <StatCard label="60-day reminders" value={String(reminder60)} />
        <StatCard label="30-day reminders" value={String(reminder30)} />
        <StatCard label="Expiration warnings" value={String(expirationWarnings)} tone="warning" />
        <StatCard label="Auto-renew due" value={String(autoDue.length)} tone="error" />
      </div>

      {canManage && autoDue.length > 0 ? (
        <RenewalsActionsClient
          profileId={profile.id}
          contracts={autoDue.map((c) => ({
            id: c.id,
            status: c.status,
            start_date: c.start_date,
            end_date: c.end_date,
            renewal_type: c.renewal_type,
            version_number: null,
            contract_number: c.contract_number,
            name: c.name,
          }))}
        />
      ) : null}

      <ContractRenewalCalendar events={calendarEvents} variant="large" />

      <details
        className="group rounded-box border border-base-300 bg-base-100 open:shadow-sm"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
              Open reminders &amp; warnings
            </h2>
            <span className="badge badge-sm badge-ghost tabular-nums">
              {openReminders.length}
            </span>
          </div>
          <span className="text-xs font-medium opacity-60 group-open:hidden">Show</span>
          <span className="hidden text-xs font-medium opacity-60 group-open:inline">Hide</span>
        </summary>
        <div className="space-y-3 border-t border-base-300 px-4 py-4">
          {openReminders.length === 0 ? (
            <EmptyState
              title="No open reminders"
              description="Reminders generate when active contracts enter the 90, 60, or 30-day windows, or approach expiration."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-sm text-center">
                <thead>
                  <tr>
                    <th className="text-center">Contract</th>
                    <th className="text-center">Customer</th>
                    <th className="text-center">Status</th>
                    <th className="text-center">Days left</th>
                    <th className="text-center">Message</th>
                    <th className="text-center">End date</th>
                  </tr>
                </thead>
                <tbody>
                  {openReminders.map((row) => {
                    const contract = unwrapJoin(
                      row.contracts as
                        | {
                            id: string;
                            contract_number: string;
                            name: string;
                            end_date: string | null;
                            customers: { name: string } | { name: string }[] | null;
                          }
                        | {
                            id: string;
                            contract_number: string;
                            name: string;
                            end_date: string | null;
                            customers: { name: string } | { name: string }[] | null;
                          }[]
                        | null
                    );
                    const customer = unwrapJoin(contract?.customers ?? null);
                    const daysLeft = daysUntilDate(contract?.end_date ?? row.anchor_date);
                    return (
                      <tr key={row.id}>
                        <td>
                          {contract ? (
                            <Link
                              href={`/contracts/${contract.id}`}
                              className="link link-hover font-medium"
                            >
                              {contract.contract_number}
                            </Link>
                          ) : (
                            "—"
                          )}
                          {contract?.name ? (
                            <div className="text-xs opacity-60">{contract.name}</div>
                          ) : null}
                        </td>
                        <td className="text-sm">{customer?.name ?? "—"}</td>
                        <td>
                          <span
                            className={`badge h-auto min-h-6 whitespace-nowrap px-2.5 py-1.5 leading-none ${reminderBadgeClass(row.reminder_kind as ReminderKind)}`}
                          >
                            {reminderKindLabel(row.reminder_kind as ReminderKind)}
                          </span>
                        </td>
                        <td className="text-sm tabular-nums">
                          {daysLeft == null ? "—" : daysLeft}
                        </td>
                        <td className="text-sm max-w-md">{row.message}</td>
                        <td className="text-xs whitespace-nowrap">
                          {formatDate(contract?.end_date ?? row.anchor_date)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
          Renewal history
        </h2>
        {recentRenewals.length === 0 ? (
          <EmptyState
            title="No renewals yet"
            description="Processed auto and manual renewals are logged here."
          />
        ) : (
          <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Contract</th>
                  <th>Method</th>
                  <th>Previous end</th>
                  <th>New term</th>
                  <th>Renewed</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {recentRenewals.map((row) => {
                  const contract = unwrapJoin(
                    row.contracts as
                      | {
                          id: string;
                          contract_number: string;
                          name: string;
                          customers: { name: string } | { name: string }[] | null;
                        }
                      | {
                          id: string;
                          contract_number: string;
                          name: string;
                          customers: { name: string } | { name: string }[] | null;
                        }[]
                      | null
                  );
                  const by = unwrapProfile(
                    (
                      row as {
                        renewed_by_profile?:
                          | { full_name: string }
                          | { full_name: string }[]
                          | null;
                      }
                    ).renewed_by_profile
                  );
                  return (
                    <tr key={row.id}>
                      <td>
                        {contract ? (
                          <Link
                            href={`/contracts/${contract.id}`}
                            className="link link-hover font-medium"
                          >
                            {contract.contract_number}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <StatusBadge
                          status={row.renewal_method}
                          label={statusLabel(row.renewal_method)}
                        />
                      </td>
                      <td className="text-xs">{formatDate(row.previous_end_date)}</td>
                      <td className="text-xs">
                        {formatDate(row.new_start_date)} → {formatDate(row.new_end_date)}
                      </td>
                      <td className="text-xs">{formatDateTime(row.renewed_at)}</td>
                      <td className="text-xs">{by?.full_name ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
