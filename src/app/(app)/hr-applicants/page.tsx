import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import {
  Briefcase,
  Percent,
  Star,
  UserRoundSearch,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { EmptyState, ErrorState } from "@/components/ui";
import { StarRating } from "@/components/StarRating";
import { HrMatchStrengthChart } from "@/components/HrMatchStrengthChart";
import type { HrDepartment, HrPosition } from "@/lib/types";
import { loadContractHoursForMatch, rankDemoApplicants } from "@/lib/hr-applicants";

const TONE = {
  sky: {
    card: "border-sky-300/60 bg-gradient-to-br from-sky-50 to-sky-100/80",
    icon: "bg-sky-500/15 text-sky-700",
    value: "text-sky-900",
  },
  violet: {
    card: "border-violet-300/60 bg-gradient-to-br from-violet-50 to-violet-100/80",
    icon: "bg-violet-500/15 text-violet-700",
    value: "text-violet-900",
  },
  amber: {
    card: "border-amber-300/60 bg-gradient-to-br from-amber-50 to-amber-100/80",
    icon: "bg-amber-500/15 text-amber-800",
    value: "text-amber-950",
  },
  emerald: {
    card: "border-emerald-300/60 bg-gradient-to-br from-emerald-50 to-emerald-100/80",
    icon: "bg-emerald-500/15 text-emerald-700",
    value: "text-emerald-900",
  },
} as const;

function MetricTile({
  label,
  value,
  tone,
  icon,
  hint,
}: {
  label: string;
  value: string;
  tone: keyof typeof TONE;
  icon: ReactNode;
  hint?: string;
}) {
  const styles = TONE[tone];
  return (
    <div className={`rounded-2xl border p-3 shadow-sm ${styles.card}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
        <span className={`rounded-lg p-1.5 ${styles.icon}`}>{icon}</span>
      </div>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${styles.value}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] opacity-60">{hint}</p> : null}
    </div>
  );
}

export default async function HrApplicantsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "hr") redirect("/dashboard");

  const supabase = await createClient();

  const [
    { data: departments, error: deptError },
    { data: positions, error: posError },
    contractHours,
  ] = await Promise.all([
    supabase.from("hr_departments").select("id, name").order("name"),
    supabase
      .from("hr_positions")
      .select("id, department_id, title, status")
      .eq("status", "open")
      .order("opened_at", { ascending: false }),
    loadContractHoursForMatch(supabase),
  ]);

  const error = deptError || posError;
  if (error) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Applicants</h1>
        <ErrorState message={error.message} />
      </div>
    );
  }

  const depts = (departments ?? []) as Pick<HrDepartment, "id" | "name">[];
  const openPositions = (positions ?? []) as Pick<
    HrPosition,
    "id" | "department_id" | "title" | "status"
  >[];
  const deptName = new Map(depts.map((d) => [d.id, d.name]));
  const openTitles = openPositions.map((p) => p.title);

  const rankedApplicants = rankDemoApplicants({
    contractHours,
    openPositionTitles: openTitles,
  });

  const strong = rankedApplicants.filter((a) => a.matchPercent >= 72).length;
  const medium = rankedApplicants.filter((a) => a.matchPercent >= 55 && a.matchPercent < 72).length;
  const weak = rankedApplicants.filter((a) => a.matchPercent < 55).length;
  const topMatch = rankedApplicants[0]?.matchPercent ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Applicants</h1>
          <p className="text-sm opacity-70">
            Ranked demo applicants matched to under-worked contracts and open roles.
          </p>
        </div>
        <Link
          href="/hr-positions"
          className="rounded-xl border border-base-300 bg-base-100 px-3 py-1.5 text-xs font-medium opacity-80 transition hover:border-violet-300 hover:bg-violet-50/60 hover:opacity-100"
        >
          Manage positions
        </Link>
      </div>

      <div className="grid gap-3 lg:grid-cols-12">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-7">
          <MetricTile
            label="Applicants"
            value={String(rankedApplicants.length)}
            tone="violet"
            icon={<UserRoundSearch className="h-4 w-4" />}
          />
          <MetricTile
            label="Open roles"
            value={String(openPositions.length)}
            tone={openPositions.length > 0 ? "amber" : "emerald"}
            icon={<Briefcase className="h-4 w-4" />}
          />
          <MetricTile
            label="Strong matches"
            value={String(strong)}
            tone="emerald"
            icon={<Star className="h-4 w-4" />}
            hint="Match ≥ 72%"
          />
          <MetricTile
            label="Top match"
            value={`${topMatch}%`}
            tone={topMatch >= 72 ? "emerald" : "amber"}
            icon={<Percent className="h-4 w-4" />}
          />
        </div>
        <div className="lg:col-span-5">
          <HrMatchStrengthChart strong={strong} medium={medium} weak={weak} />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        <section className="overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-b from-amber-50/80 to-base-100 shadow-sm lg:col-span-2">
          <div className="border-b border-amber-200/70 px-3 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-900/80">
              Open roles ({openPositions.length})
            </h2>
          </div>
          <div className="p-3">
            {openPositions.length === 0 ? (
              <p className="text-sm opacity-60">No open roles right now.</p>
            ) : (
              <ul className="space-y-2">
                {openPositions.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-amber-100 bg-white/85 px-3 py-2.5 shadow-sm"
                  >
                    <p className="truncate text-sm font-semibold">{p.title}</p>
                    <p className="shrink-0 text-[11px] opacity-70">
                      {deptName.get(p.department_id) ?? "—"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-violet-200/80 bg-gradient-to-b from-violet-50/80 to-base-100 shadow-sm lg:col-span-3">
          <div className="border-b border-violet-200/70 px-3 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-violet-900/80">
              Who to hire ({rankedApplicants.length})
            </h2>
          </div>
          <div className="p-3">
            {rankedApplicants.length === 0 ? (
              <EmptyState title="No applicants" />
            ) : (
              <ul className="space-y-2">
                {rankedApplicants.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-violet-100 bg-white/85 px-3 py-2.5 shadow-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{a.fullName}</p>
                      <p className="truncate text-[11px] opacity-70">{a.appliedFor}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums text-violet-900">
                        {a.matchPercent}%
                      </p>
                      <StarRating stars={a.stars} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
