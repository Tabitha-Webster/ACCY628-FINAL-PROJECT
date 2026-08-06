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
  href,
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "warning" | "error" | "info";
  className?: string;
  explanation?: MetricExplanation;
  href?: string;
  onClick?: () => void;
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

  const interactive = Boolean(href || onClick);
  const body = (
    <>
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] opacity-55">{label}</p>
      <p className="mt-2.5 text-[1.65rem] font-semibold tracking-tight tabular-nums leading-none">{value}</p>
      {hint ? <p className="mt-2 text-xs leading-relaxed opacity-60">{hint}</p> : null}
      {explanation ? <ExplainNumber explanation={explanation} /> : null}
    </>
  );

  const classes = `rounded-box border ${border} bg-base-100 p-5 text-left ${
    interactive
      ? "transition hover:border-primary/35 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      : ""
  } ${className}`.trim();

  if (href) {
    return (
      <a href={href} className={`block ${classes}`}>
        {body}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`w-full ${classes}`}>
        {body}
      </button>
    );
  }

  return <div className={classes}>{body}</div>;
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-box border border-dashed border-base-300 bg-base-100 px-8 py-10 text-center">
      <p className="text-base font-semibold tracking-tight">{title}</p>
      {description ? (
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-base-content/65">{description}</p>
      ) : null}
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

export function StatusBadge({
  status,
  label,
  className = "",
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={`badge badge-outline inline-flex h-auto min-h-5 w-max shrink-0 items-center justify-center whitespace-nowrap px-2.5 py-1 leading-tight ${statusBadgeClass(status)} ${className}`.trim()}
    >
      {label ?? statusLabel(status)}
    </span>
  );
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
    <div className="app-page-header-row mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
      <div className="min-w-0 flex-1 space-y-1.5">
        <h1 className="text-[1.75rem] font-semibold tracking-tight md:text-[2rem]">{title}</h1>
        {description ? (
          <p className="max-w-2xl text-sm leading-relaxed text-base-content/65">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
      ) : null}
    </div>
  );
}

export function Money({ value }: { value: number }) {
  return <span className="font-mono text-[0.925em] tabular-nums tracking-tight">{formatCurrency(value)}</span>;
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

