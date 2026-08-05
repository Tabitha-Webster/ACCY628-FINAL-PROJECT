import type { HrContractor, HrDepartment, HrPosition } from "@/lib/types";

export type DeptHeadcount = {
  departmentId: string;
  departmentName: string;
  activeCount: number;
};

export type PositionStatusCounts = {
  open: number;
  filled: number;
  closed: number;
};

export type HiringTrendPoint = {
  month: string; // YYYY-MM
  label: string;
  hires: number;
};

export type DeptCostAverage = {
  departmentId: string;
  departmentName: string;
  activeCount: number;
  avgAnnualCost: number;
};

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

/** Active contractors grouped by department. */
export function contractorsByDepartment(
  contractors: Pick<HrContractor, "department_id" | "status">[],
  departments: Pick<HrDepartment, "id" | "name">[]
): DeptHeadcount[] {
  const counts = new Map<string, number>();
  for (const c of contractors) {
    if (c.status !== "active") continue;
    counts.set(c.department_id, (counts.get(c.department_id) ?? 0) + 1);
  }
  return departments
    .map((d) => ({
      departmentId: d.id,
      departmentName: d.name,
      activeCount: counts.get(d.id) ?? 0,
    }))
    .sort((a, b) => b.activeCount - a.activeCount || a.departmentName.localeCompare(b.departmentName));
}

export function positionStatusCounts(
  positions: Pick<HrPosition, "status">[]
): PositionStatusCounts {
  const result: PositionStatusCounts = { open: 0, filled: 0, closed: 0 };
  for (const p of positions) {
    if (p.status === "open") result.open += 1;
    else if (p.status === "filled") result.filled += 1;
    else if (p.status === "closed") result.closed += 1;
  }
  return result;
}

/** Count hires by month for the last `months` calendar months ending at `asOf`. */
export function hiringTrends(
  contractors: Pick<HrContractor, "hired_at">[],
  months = 12,
  asOf: Date = new Date()
): HiringTrendPoint[] {
  const points: HiringTrendPoint[] = [];
  const year = asOf.getUTCFullYear();
  const month = asOf.getUTCMonth(); // 0-based

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    points.push({ month: key, label: monthLabel(key), hires: 0 });
  }

  const index = new Map(points.map((p, i) => [p.month, i]));
  for (const c of contractors) {
    const key = monthKey(c.hired_at);
    const idx = index.get(key);
    if (idx !== undefined) points[idx].hires += 1;
  }
  return points;
}

/** Average annual cost among active contractors overall. */
export function averageCostPerContractor(
  contractors: Pick<HrContractor, "status" | "annual_cost">[]
): number | null {
  const active = contractors.filter((c) => c.status === "active");
  if (active.length === 0) return null;
  const sum = active.reduce((acc, c) => acc + Number(c.annual_cost ?? 0), 0);
  return sum / active.length;
}

/** Average annual cost by department (active only). */
export function averageCostByDepartment(
  contractors: Pick<HrContractor, "department_id" | "status" | "annual_cost">[],
  departments: Pick<HrDepartment, "id" | "name">[]
): DeptCostAverage[] {
  const sums = new Map<string, { count: number; total: number }>();
  for (const c of contractors) {
    if (c.status !== "active") continue;
    const entry = sums.get(c.department_id) ?? { count: 0, total: 0 };
    entry.count += 1;
    entry.total += Number(c.annual_cost ?? 0);
    sums.set(c.department_id, entry);
  }
  return departments
    .map((d) => {
      const entry = sums.get(d.id);
      return {
        departmentId: d.id,
        departmentName: d.name,
        activeCount: entry?.count ?? 0,
        avgAnnualCost: entry && entry.count > 0 ? entry.total / entry.count : 0,
      };
    })
    .filter((r) => r.activeCount > 0)
    .sort((a, b) => b.avgAnnualCost - a.avgAnnualCost);
}

/**
 * Budget utilization: sum of active contractor annual costs ÷ sum of department annual budgets.
 * Returns a ratio (0–1+); null if total budget is 0.
 */
export function budgetUtilization(
  contractors: Pick<HrContractor, "status" | "annual_cost">[],
  departments: Pick<HrDepartment, "annual_budget">[]
): number | null {
  const totalBudget = departments.reduce((acc, d) => acc + Number(d.annual_budget ?? 0), 0);
  if (totalBudget <= 0) return null;
  const activeCost = contractors
    .filter((c) => c.status === "active")
    .reduce((acc, c) => acc + Number(c.annual_cost ?? 0), 0);
  return activeCost / totalBudget;
}

/**
 * Retention among contractors hired in the last `windowMonths` months:
 * still active / total hired in window. Returns ratio 0–1, or null if none hired.
 */
export function contractorRetentionRate(
  contractors: Pick<HrContractor, "hired_at" | "status">[],
  windowMonths = 12,
  asOf: Date = new Date()
): number | null {
  const cutoff = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - windowMonths, asOf.getUTCDate())
  );
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const inWindow = contractors.filter((c) => c.hired_at >= cutoffStr);
  if (inWindow.length === 0) return null;
  const stillActive = inWindow.filter((c) => c.status === "active").length;
  return stillActive / inWindow.length;
}
