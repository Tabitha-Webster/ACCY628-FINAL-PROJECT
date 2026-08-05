export function formatCurrency(value: number | null | undefined) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);
}

export function formatPercent(value: number | null | undefined) {
  if (value == null || Number.isNaN(value) || !Number.isFinite(value)) {
    return "—";
  }
  return `${value.toFixed(1)}%`;
}

export function formatHours(value: number | null | undefined) {
  const n = Number(value ?? 0);
  return `${n.toFixed(1)} hrs`;
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export function statusLabel(status: string) {
  if (status === "overdue") return "Overdue";
  if (status === "at_risk") return "At Risk";
  if (status === "not_yet_due") return "Not Yet Due";
  if (status === "not_defined") return "SLA Not Defined";
  if (status === "missed") return "Missed";
  if (status === "met") return "Met";
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function statusBadgeClass(status: string) {
  const s = status.toLowerCase();
  if (
    ["active", "paid", "approved", "resolved", "closed", "met", "normal", "filled", "renewed", "sent"].includes(
      s
    )
  )
    return "badge-success";
  if (["issued", "current"].includes(s)) return "badge-info";
  if (
    [
      "pending",
      "pending_approval",
      "draft",
      "warning",
      "at_risk",
      "partially_paid",
      "in_progress",
      "assigned",
      "open",
      "on_hold",
      "medium",
      "not_yet_due",
    ].includes(s)
  )
    return "badge-warning";
  if (
    [
      "overdue",
      "disputed",
      "rejected",
      "canceled",
      "expired",
      "missed",
      "over_limit",
      "unprofitable",
      "ended",
      "critical",
      "high",
    ].includes(s)
  )
    return "badge-error";
  if (["low", "new", "not_defined"].includes(s)) return "badge-ghost";
  return "badge-ghost";
}
