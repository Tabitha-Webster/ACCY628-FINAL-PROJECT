"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import type { DashboardView, PeriodOption } from "@/lib/dashboard-period";

export function PeriodViewControls({
  view,
  periodKey,
  selectedLabel,
  monthOptions,
  quarterOptions,
  yearOptions,
}: {
  view: DashboardView;
  periodKey: string;
  selectedLabel: string;
  monthOptions: PeriodOption[];
  quarterOptions: PeriodOption[];
  yearOptions: PeriodOption[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Exclude<DashboardView, "all"> | null>(view === "all" ? null : view);

  useEffect(() => {
    setExpanded(view === "all" ? null : view);
  }, [view]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function hrefFor(nextView: DashboardView, nextPeriod?: string) {
    if (nextView === "all") return `${pathname}?view=all`;
    return `${pathname}?view=${nextView}&period=${nextPeriod}`;
  }

  function selectPeriod(nextView: DashboardView, nextPeriod?: string) {
    router.push(hrefFor(nextView, nextPeriod));
    setOpen(false);
  }

  function toggleGroup(group: Exclude<DashboardView, "all">) {
    setExpanded((current) => (current === group ? null : group));
  }

  return (
    <div ref={rootRef} className="relative flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide opacity-60">View</span>
      <button
        type="button"
        className="btn btn-xs btn-outline h-6 min-h-6 gap-1 px-2"
        aria-label="View period"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="max-w-[8.5rem] truncate">{selectedLabel}</span>
        <ChevronDown className={`size-3 shrink-0 opacity-60 ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div
          className="absolute right-0 z-50 mt-1 w-52 overflow-hidden rounded-md border border-base-300 bg-base-100 py-1 text-xs shadow-lg"
          role="listbox"
          aria-label="Reporting period"
        >
          <button
            type="button"
            className={`block w-full px-3 py-1.5 text-left ${view === "all" ? "bg-primary/10 font-semibold text-primary" : "hover:bg-base-200"}`}
            onClick={() => selectPeriod("all")}
          >
            All
          </button>

          <OptionGroup
            label="Monthly"
            open={expanded === "month"}
            active={view === "month"}
            onToggle={() => toggleGroup("month")}
          >
            {monthOptions.map((option) => (
              <OptionButton
                key={option.key}
                label={option.label}
                selected={view === "month" && periodKey === option.key}
                onClick={() => selectPeriod("month", option.key)}
              />
            ))}
          </OptionGroup>

          <OptionGroup
            label="Quarterly"
            open={expanded === "quarter"}
            active={view === "quarter"}
            onToggle={() => toggleGroup("quarter")}
          >
            {quarterOptions.map((option) => (
              <OptionButton
                key={option.key}
                label={option.label}
                selected={view === "quarter" && periodKey === option.key}
                onClick={() => selectPeriod("quarter", option.key)}
              />
            ))}
          </OptionGroup>

          <OptionGroup
            label="Yearly"
            open={expanded === "year"}
            active={view === "year"}
            onToggle={() => toggleGroup("year")}
          >
            {yearOptions.map((option) => (
              <OptionButton
                key={option.key}
                label={option.label}
                selected={view === "year" && periodKey === option.key}
                onClick={() => selectPeriod("year", option.key)}
              />
            ))}
          </OptionGroup>
        </div>
      ) : null}
    </div>
  );
}

function OptionGroup({
  label,
  open,
  active,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  active: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        className={`flex w-full items-center justify-between px-3 py-1.5 text-left font-semibold ${
          active ? "text-primary" : "hover:bg-base-200"
        }`}
        aria-expanded={open}
        onClick={onToggle}
      >
        <span>{label}</span>
        <ChevronDown className={`size-3 opacity-50 ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <div className="max-h-40 overflow-auto border-y border-base-200 bg-base-200/40 py-0.5">{children}</div> : null}
    </div>
  );
}

function OptionButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`block w-full px-5 py-1 text-left ${selected ? "bg-primary/10 font-medium text-primary" : "hover:bg-base-200"}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
