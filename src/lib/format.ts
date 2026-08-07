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
  if (status === "not_submitted") return "Not Submitted";
  if (status === "more_information_required") return "More Information Required";
  if (status === "pending") return "Pending Approval";
  if (status === "expired") return "Completed";
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function statusBadgeClass(status: string) {
  const s = status.toLowerCase();
  // Contract lifecycle — each status gets a distinct color (see View and Edit legend).
  if (s === "draft") return "border-stone-400 text-stone-300";
  if (s === "pending_approval") return "badge-pending-approval";
  if (s === "active") return "badge-success";
  if (s === "on_hold") return "border-violet-400 text-violet-300";
  if (s === "expired") return "badge-neutral";
  if (s === "canceled") return "badge-error";
  if (s === "renewed") return "badge-info";

  if (
    ["paid", "approved", "resolved", "closed", "met", "normal", "filled", "sent", "loyal"].includes(
      s
    )
  )
    return "badge-success";
  if (["disputed", "overdue", "issued", "steady"].includes(s)) return "badge-ghost";
  if (s === "current" || s === "new") return "badge-info";
  if (
    [
      "pending",
      "awaiting_billing",
      "warning",
      "at_risk",
      "partially_paid",
      "in_progress",
      "assigned",
      "open",
      "medium",
      "not_yet_due",
      "replacement_parts",
      "reimbursable_expenses",
    ].includes(s)
  )
    return "badge-warning";
  if (
    [
      "rejected",
      "missed",
      "over_limit",
      "unprofitable",
      "ended",
      "critical",
      "high",
    ].includes(s)
  )
    return "badge-error";
  if (["low", "not_defined"].includes(s)) return "badge-ghost";
  return "badge-ghost";
}
