import {
  addMonths,
  addQuarters,
  addYears,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  format,
  parse,
  startOfMonth,
  startOfQuarter,
  startOfYear,
} from "date-fns";

export type DashboardView = "month" | "quarter" | "year" | "all";

export type DashboardPeriod = {
  view: DashboardView;
  key: string;
  label: string;
  start: string;
  end: string;
  monthKeys: string[];
  unbounded: boolean;
};

export type PeriodOption = {
  key: string;
  label: string;
};

const ALL_TIME_START = "1900-01-01";
const ALL_TIME_END = "9999-12-31";
const ALL_TIME_KEY = "all";
const ALL_TIME_LABEL = "All time";

/** Earliest active demo contract start ΓÇö used as company inception for year/month lists. */
export const COMPANY_START_DATE = new Date(2023, 0, 1);

function toDateString(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function monthKeyFromDate(date: Date) {
  return format(date, "yyyy-MM");
}

function monthKeysBetween(start: Date, end: Date) {
  const keys: string[] = [];
  let cursor = startOfMonth(start);
  const last = startOfMonth(end);
  while (cursor <= last) {
    keys.push(monthKeyFromDate(cursor));
    cursor = addMonths(cursor, 1);
  }
  return keys;
}

export function parseDashboardView(value: string | string[] | undefined): DashboardView {
  const view = Array.isArray(value) ? value[0] : value;
  if (view === "quarter" || view === "year" || view === "month" || view === "all") return view;
  return "all";
}

function parsePeriodDate(view: DashboardView, key: string | undefined, now = new Date()) {
  if (view === "all") return startOfMonth(now);

  if (!key) {
    if (view === "quarter") return startOfQuarter(now);
    if (view === "year") return startOfYear(now);
    return startOfMonth(now);
  }

  if (view === "month") {
    const parsed = parse(key, "yyyy-MM", now);
    if (!Number.isNaN(parsed.getTime())) return startOfMonth(parsed);
  }

  if (view === "quarter") {
    const match = /^(\d{4})-Q([1-4])$/.exec(key);
    if (match) {
      const year = Number(match[1]);
      const quarter = Number(match[2]);
      return startOfQuarter(new Date(year, (quarter - 1) * 3, 1));
    }
  }

  if (view === "year") {
    const parsed = parse(key, "yyyy", now);
    if (!Number.isNaN(parsed.getTime())) return startOfYear(parsed);
  }

  if (view === "quarter") return startOfQuarter(now);
  if (view === "year") return startOfYear(now);
  return startOfMonth(now);
}

export function periodKeyForDate(view: DashboardView, date: Date) {
  if (view === "all") return ALL_TIME_KEY;
  if (view === "quarter") return format(date, "yyyy-'Q'Q");
  if (view === "year") return format(date, "yyyy");
  return format(date, "yyyy-MM");
}

export function periodLabelForDate(view: DashboardView, date: Date) {
  if (view === "all") return ALL_TIME_LABEL;
  if (view === "quarter") return format(date, "QQQ yyyy");
  if (view === "year") return format(date, "yyyy");
  return format(date, "MMMM yyyy");
}

export function compactPeriodLabelForDate(view: DashboardView, date: Date) {
  if (view === "all") return "All";
  if (view === "quarter") return format(date, "QQQ yyyy");
  if (view === "year") return format(date, "yyyy");
  return format(date, "MMM yyyy");
}

export function resolveDashboardPeriod(
  viewValue: string | string[] | undefined,
  periodValue: string | string[] | undefined,
  now = new Date()
): DashboardPeriod {
  const view = parseDashboardView(viewValue);
  if (view === "all") {
    return {
      view,
      key: ALL_TIME_KEY,
      label: ALL_TIME_LABEL,
      start: ALL_TIME_START,
      end: ALL_TIME_END,
      monthKeys: [],
      unbounded: true,
    };
  }

  const key = Array.isArray(periodValue) ? periodValue[0] : periodValue;
  const date = parsePeriodDate(view, key, now);
  const startDate = view === "quarter" ? startOfQuarter(date) : view === "year" ? startOfYear(date) : startOfMonth(date);
  const endDate = view === "quarter" ? endOfQuarter(date) : view === "year" ? endOfYear(date) : endOfMonth(date);

  return {
    view,
    key: periodKeyForDate(view, startDate),
    label: periodLabelForDate(view, startDate),
    start: toDateString(startDate),
    end: toDateString(endDate),
    monthKeys: monthKeysBetween(startDate, endDate),
    unbounded: false,
  };
}

export function shiftDashboardPeriod(period: DashboardPeriod, direction: -1 | 1): DashboardPeriod {
  if (period.view === "all") return period;
  const current = parsePeriodDate(period.view, period.key);
  const next =
    period.view === "quarter"
      ? addQuarters(current, direction)
      : period.view === "year"
        ? addYears(current, direction)
        : addMonths(current, direction);
  return resolveDashboardPeriod(period.view, periodKeyForDate(period.view, next), next);
}

export function convertDashboardView(period: DashboardPeriod, nextView: DashboardView, now = new Date()): DashboardPeriod {
  if (nextView === "all") return resolveDashboardPeriod("all", ALL_TIME_KEY, now);
  if (period.view === "all") return resolveDashboardPeriod(nextView, periodKeyForDate(nextView, now), now);
  const current = parsePeriodDate(period.view, period.key);
  return resolveDashboardPeriod(nextView, periodKeyForDate(nextView, current), current);
}

export function dashboardPeriodOptions(view: DashboardView, selectedKey?: string, now = new Date()): PeriodOption[] {
  if (view === "all") return [{ key: ALL_TIME_KEY, label: "All" }];

  const options: PeriodOption[] = [];
  const companyStart = COMPANY_START_DATE;

  if (view === "year") {
    const startYear = companyStart.getFullYear();
    const endYear = now.getFullYear();
    for (let year = endYear; year >= startYear; year -= 1) {
      options.push({ key: String(year), label: String(year) });
    }
  } else if (view === "quarter") {
    let cursor = startOfQuarter(endOfYear(now));
    const first = startOfQuarter(companyStart);
    while (cursor >= first) {
      options.push({ key: periodKeyForDate("quarter", cursor), label: format(cursor, "QQQ yyyy") });
      cursor = addQuarters(cursor, -1);
    }
  } else {
    let cursor = addMonths(startOfMonth(now), 2);
    const first = startOfMonth(companyStart);
    while (cursor >= first) {
      options.push({ key: periodKeyForDate("month", cursor), label: format(cursor, "MMMM yyyy") });
      cursor = addMonths(cursor, -1);
    }
  }

  if (selectedKey && !options.some((option) => option.key === selectedKey)) {
    const date = parsePeriodDate(view, selectedKey, now);
    options.unshift({ key: selectedKey, label: compactPeriodLabelForDate(view, date) });
  }

  return options;
}

export function periodViewControlProps(period: DashboardPeriod) {
  return {
    view: period.view,
    periodKey: period.key,
    selectedLabel: period.view === "all" ? "All" : compactPeriodLabelForDate(period.view, parsePeriodDate(period.view, period.key)),
    monthOptions: dashboardPeriodOptions("month", period.view === "month" ? period.key : undefined),
    quarterOptions: dashboardPeriodOptions("quarter", period.view === "quarter" ? period.key : undefined),
    yearOptions: dashboardPeriodOptions("year", period.view === "year" ? period.key : undefined),
  };
}

export function dateInDashboardPeriod(dateStr: string | null | undefined, period: DashboardPeriod) {
  if (!dateStr) return false;
  if (period.unbounded) return true;
  const value = dateStr.slice(0, 10);
  return value >= period.start && value <= period.end;
}

export function monthKeyInDashboardPeriod(dateStr: string | null | undefined, period: DashboardPeriod) {
  if (!dateStr) return false;
  if (period.unbounded) return true;
  return period.monthKeys.includes(dateStr.slice(0, 7));
}

export function periodOverlapsToday(period: DashboardPeriod, now = new Date()) {
  if (period.unbounded) return true;
  const today = toDateString(now);
  return today >= period.start && today <= period.end;
}
