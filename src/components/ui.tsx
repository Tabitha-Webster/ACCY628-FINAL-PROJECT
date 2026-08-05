import { formatCurrency, formatDate, formatHours, formatPercent, statusBadgeClass, statusLabel } from "@/lib/format";
import { ExplainNumber, type MetricExplanation } from "@/components/ExplainNumber";

export type { MetricExplanation };

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  className = "",
  explanation,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "warning" | "error" | "info";
  className?: string;
  explanation?: MetricExplanation;
}) {
  const border =
    tone === "success"
      ? "border-success/40"
      : tone === "warning"
        ? "border-warning/40"
        : tone === "error"
          ? "border-error/40"
          : tone === "info"
            ? "border-info/40"
            : "border-base-300";

  return (
    <div className={`rounded-box border ${border} bg-base-100 p-4 shadow-sm ${className}`.trim()}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-60">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs opacity-60">{hint}</p> : null}
      {explanation ? <ExplainNumber explanation={explanation} /> : null}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-box border border-dashed border-base-300 bg-base-100 p-8 text-center">
      <p className="font-medium">{title}</p>
      {description ? <p className="mt-2 text-sm opacity-70">{description}</p> : null}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="alert alert-error">
      <span>{message}</span>
    </div>
  );
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <span className={`badge ${statusBadgeClass(status)}`}>{label ?? statusLabel(status)}</span>;
}

export type PageHeaderProps = {
  title: string;
  /** Short supporting line under the title. */
  description?: string;
  /** Optional primary actions (buttons/links) aligned to the right on larger screens. */
  actions?: React.ReactNode;
};

/**
 * Shared page header: title, optional description, optional action area.
 * Spacing matches PageLayout; standalone use keeps a bottom margin.
 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="app-page-header-row mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        {description ? (
          <p className="max-w-3xl text-sm leading-relaxed opacity-70">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end sm:pt-1">{actions}</div>
      ) : null}
    </div>
  );
}

export function Money({ value }: { value: number }) {
  return <span className="tabular-nums">{formatCurrency(value)}</span>;
}

export function Hours({ value }: { value: number }) {
  return <span className="tabular-nums">{formatHours(value)}</span>;
}

export function Percent({ value }: { value: number }) {
  return <span className="tabular-nums">{formatPercent(value)}</span>;
}

export function DateText({ value }: { value: string | null | undefined }) {
  return <span>{formatDate(value)}</span>;
}

export { DataTable } from "@/components/DataTable";

export function AccountingExplainer() {
  return (
    <div className="rounded-box border border-base-300 bg-base-200/50 p-4 text-sm leading-relaxed">
      <p className="font-semibold">How this system thinks about money (simplified)</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 opacity-80">
        <li>
          <strong>Earned / recognized revenue</strong> is work or service already delivered.
        </li>
        <li>
          <strong>Deferred revenue</strong> is money billed or collected before the service month is
          finished.
        </li>
        <li>
          <strong>Unbilled revenue</strong> is earned work not yet placed on an invoice.
        </li>
        <li>
          <strong>Accounts receivable</strong> is issued invoices not yet collected.
        </li>
      </ul>
      <p className="mt-3 text-xs opacity-60">
        This is an educational contract-to-cash model for class use. It does not replace a full
        accounting system or professional accounting judgment.
      </p>
    </div>
  );
}
