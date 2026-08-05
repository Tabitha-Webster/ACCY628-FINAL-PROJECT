"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DashboardView } from "@/lib/dashboard-period";

const VIEWS: { id: DashboardView; label: string }[] = [
  { id: "month", label: "Monthly" },
  { id: "quarter", label: "Quarterly" },
  { id: "year", label: "Yearly" },
];

export function PeriodViewControls({
  view,
  periodKey,
  prevPeriodKey,
  nextPeriodKey,
  viewHrefs,
  options,
}: {
  view: DashboardView;
  periodKey: string;
  prevPeriodKey: string;
  nextPeriodKey: string;
  viewHrefs: Record<DashboardView, string>;
  options: { key: string; label: string }[];
}) {
  const pathname = usePathname();
  const router = useRouter();

  function hrefFor(nextView: DashboardView, nextPeriod: string) {
    return `${pathname}?view=${nextView}&period=${nextPeriod}`;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="join">
        {VIEWS.map((item) => (
          <Link
            key={item.id}
            href={viewHrefs[item.id]}
            className={`btn btn-xs join-item h-6 min-h-6 px-2 ${view === item.id ? "btn-primary" : "btn-outline"}`}
          >
            {item.label}
          </Link>
        ))}
      </div>
      <div className="join">
        <Link
          href={hrefFor(view, prevPeriodKey)}
          className="btn btn-xs btn-outline join-item h-6 min-h-6 w-6 px-0"
          aria-label={`Previous ${view}`}
        >
          <ChevronLeft className="size-3" />
        </Link>
        <select
          className="join-item select select-bordered select-xs h-6 min-h-6 w-[7.25rem] py-0 pr-6 text-xs leading-none"
          value={periodKey}
          aria-label={`Select ${view}`}
          onChange={(event) => router.push(hrefFor(view, event.target.value))}
        >
          {options.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
        <Link
          href={hrefFor(view, nextPeriodKey)}
          className="btn btn-xs btn-outline join-item h-6 min-h-6 w-6 px-0"
          aria-label={`Next ${view}`}
        >
          <ChevronRight className="size-3" />
        </Link>
      </div>
    </div>
  );
}
