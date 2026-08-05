"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { formatDate } from "@/lib/format";

export type CompareOp = "gt" | "lt" | "eq";

export function matchesText(value: string | null | undefined, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (value ?? "").toLowerCase().includes(q);
}

export function matchesDateSearch(value: string | null | undefined, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (!value) return false;
  return value.toLowerCase().includes(q) || formatDate(value).toLowerCase().includes(q);
}

export function matchesCompare(value: number, op: CompareOp, raw: string) {
  if (raw.trim() === "") return true;
  const amount = Number(raw);
  if (!Number.isFinite(amount)) return true;
  if (op === "gt") return value > amount;
  if (op === "lt") return value < amount;
  return Math.abs(value - amount) <= 0.009;
}

export type MultiFilter = string[] | null;

export function matchesAnySelected(value: string | null | undefined, selected: MultiFilter) {
  if (selected == null) return true;
  if (selected.length === 0) return false;
  const current = (value ?? "").trim().toLowerCase();
  return selected.some((item) => item.trim().toLowerCase() === current);
}

const MONTH_LABELS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function parseDateParts(value: string | Date | null | undefined): { year: string; month: string } | null {
  if (!value) return null;
  if (typeof value === "string") {
    const iso = value.match(/(\d{4})-(\d{2})(?:-\d{2})?/);
    if (iso) return { year: iso[1], month: iso[2] };
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return { year: String(parsed.getFullYear()), month: String(parsed.getMonth() + 1).padStart(2, "0") };
  }
  if (Number.isNaN(value.getTime())) return null;
  return { year: String(value.getFullYear()), month: String(value.getMonth() + 1).padStart(2, "0") };
}

export function matchesDatePeriod(
  value: string | Date | null | undefined,
  years: MultiFilter,
  months: MultiFilter
) {
  if (years == null && months == null) return true;
  const parts = parseDateParts(value);
  if (!parts) return false;
  return matchesAnySelected(parts.year, years) && matchesAnySelected(parts.month, months);
}

export function monthLabel(month: string) {
  const index = Number(month) - 1;
  return MONTH_LABELS[index] ?? month;
}

export function useHeaderFilter<T extends string>() {
  const [openFilter, setOpenFilter] = useState<T | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-table-filter-menu]")) return;
      if (!tableRef.current?.contains(event.target as Node)) setOpenFilter(null);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenFilter(null);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function toggleFilter(key: T) {
    setOpenFilter((current) => (current === key ? null : key));
  }

  return { openFilter, setOpenFilter, toggleFilter, tableRef };
}

export function StickyFilterTable({
  tableRef,
  children,
}: {
  tableRef: React.RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  return (
    <div ref={tableRef} className="filter-table-scroll overflow-auto rounded-box border border-base-300 bg-base-100">
      <table className="filter-table w-full border-separate border-spacing-0 text-left text-sm">{children}</table>
    </div>
  );
}

export function DropdownHeader({
  label,
  active,
  open,
  align = "left",
  onToggle,
  children,
}: {
  label: string;
  active: boolean;
  open: boolean;
  align?: "left" | "right";
  onToggle: () => void;
  children: ReactNode;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;

    function updatePosition() {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      const width = 176;
      const left = align === "right" ? Math.max(8, rect.right - width) : Math.min(rect.left, window.innerWidth - width - 8);
      setMenuPos({ top: rect.bottom + 4, left });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    document.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, align]);

  return (
    <th className="sticky top-0 z-20 min-w-0 bg-base-100 px-2 py-2">
      <button
        ref={buttonRef}
        type="button"
        className={`flex w-full items-center justify-between gap-1 text-left text-sm font-semibold normal-case ${
          active ? "text-primary" : "hover:opacity-80"
        }`}
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 ${open ? "rotate-180" : ""} ${active ? "text-primary" : "opacity-50"}`} />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              data-table-filter-menu="true"
              className="fixed z-[80] max-h-56 w-44 overflow-auto rounded-md border border-base-300 bg-base-100 p-1.5 text-left text-xs font-normal normal-case shadow-lg"
              style={{ top: menuPos.top, left: menuPos.left }}
            >
              {children}
            </div>,
            document.body
          )
        : null}
    </th>
  );
}

export function StaticHeader({ label, align = "left" }: { label: string; align?: "left" | "right" }) {
  return (
    <th className="sticky top-0 z-20 min-w-0 bg-base-100 px-2 py-2">
      <div className={`flex items-center text-sm font-semibold ${align === "right" ? "justify-end" : "justify-start"}`}>
        {label}
      </div>
    </th>
  );
}

export function FilterOption({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`block w-full truncate rounded px-1.5 py-1 text-left text-xs ${selected ? "bg-primary/10 font-medium text-primary" : "hover:bg-base-200"}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function MultiSelectFilter({
  options,
  selected,
  onChange,
  formatLabel = (value) => value,
}: {
  options: readonly string[];
  selected: MultiFilter;
  onChange: (next: MultiFilter) => void;
  formatLabel?: (value: string) => string;
}) {
  const allSelected = selected == null || (selected.length > 0 && selected.length === options.length);

  function toggleAll() {
    onChange(allSelected ? [] : null);
  }

  function toggleOption(option: string) {
    if (selected == null || (selected.length > 0 && selected.length === options.length)) {
      onChange(options.filter((item) => item.toLowerCase() !== option.toLowerCase()));
      return;
    }

    const exists = selected.some((item) => item.toLowerCase() === option.toLowerCase());
    const next = exists
      ? selected.filter((item) => item.toLowerCase() !== option.toLowerCase())
      : [...selected, option];

    onChange(next.length === options.length ? null : next);
  }

  function isChecked(option: string) {
    if (selected == null) return true;
    return selected.some((item) => item.toLowerCase() === option.toLowerCase());
  }

  return (
    <div className="space-y-0.5">
      <label className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-1 hover:bg-base-200">
        <input type="checkbox" className="checkbox checkbox-xs shrink-0" checked={allSelected} onChange={toggleAll} />
        <span className="truncate">(All)</span>
      </label>
      {options.map((option) => (
        <label key={option} className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-1 hover:bg-base-200">
          <input
            type="checkbox"
            className="checkbox checkbox-xs shrink-0"
            checked={isChecked(option)}
            onChange={() => toggleOption(option)}
          />
          <span className="truncate">{formatLabel(option)}</span>
        </label>
      ))}
    </div>
  );
}

export function ClearOption({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="mt-1 block w-full rounded px-1.5 py-1 text-left text-xs opacity-70 hover:bg-base-200 disabled:cursor-not-allowed disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
    >
      Clear filter
    </button>
  );
}

export function TextFilter({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <>
      <input
        className="input input-bordered input-xs w-full"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus
      />
      <ClearOption disabled={!value.trim()} onClick={() => onChange("")} />
    </>
  );
}

export function DateFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <TextFilter value={value} onChange={onChange} placeholder="Search date" />;
}

export function DatePeriodFilter({
  dates,
  years,
  months,
  onYearsChange,
  onMonthsChange,
}: {
  dates: Array<string | Date | null | undefined>;
  years: MultiFilter;
  months: MultiFilter;
  onYearsChange: (next: MultiFilter) => void;
  onMonthsChange: (next: MultiFilter) => void;
}) {
  const yearOptions = Array.from(
    new Set(dates.map((date) => parseDateParts(date)?.year).filter((year): year is string => Boolean(year)))
  ).sort((a, b) => Number(b) - Number(a));

  const monthOptions = Array.from(
    new Set(dates.map((date) => parseDateParts(date)?.month).filter((month): month is string => Boolean(month)))
  ).sort((a, b) => Number(a) - Number(b));

  return (
    <div className="space-y-2">
      <div>
        <p className="px-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-60">Year</p>
        {yearOptions.length === 0 ? (
          <p className="px-1 text-xs opacity-60">No dates</p>
        ) : (
          <MultiSelectFilter options={yearOptions} selected={years} onChange={onYearsChange} />
        )}
      </div>
      <div>
        <p className="px-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-60">Month</p>
        {monthOptions.length === 0 ? (
          <p className="px-1 text-xs opacity-60">No dates</p>
        ) : (
          <MultiSelectFilter options={monthOptions} selected={months} onChange={onMonthsChange} formatLabel={monthLabel} />
        )}
      </div>
    </div>
  );
}

export function CompareFilter({
  op,
  value,
  onOpChange,
  onValueChange,
}: {
  op: CompareOp;
  value: string;
  onOpChange: (op: CompareOp) => void;
  onValueChange: (value: string) => void;
}) {
  return (
    <>
      <select className="select select-bordered select-xs w-full" value={op} onChange={(e) => onOpChange(e.target.value as CompareOp)}>
        <option value="gt">Greater than</option>
        <option value="lt">Less than</option>
        <option value="eq">Equal to</option>
      </select>
      <input
        className="input input-bordered input-xs mt-1 w-full"
        type="number"
        min="0"
        step="0.01"
        placeholder="Amount"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
      />
      <ClearOption
        disabled={!value.trim()}
        onClick={() => {
          onValueChange("");
          onOpChange("gt");
        }}
      />
    </>
  );
}
