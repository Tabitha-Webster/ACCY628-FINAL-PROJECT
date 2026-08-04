import { formatCurrency, formatDate, formatHours, formatPercent, statusBadgeClass, statusLabel } from "@/lib/format";

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "warning" | "error";
}) {
  const border =
    tone === "success"
      ? "border-success/40"
      : tone === "warning"
        ? "border-warning/40"
        : tone === "error"
          ? "border-error/40"
          : "border-base-300";

  return (
    <div className={`rounded-box border ${border} bg-base-100 p-4 shadow-sm`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-60">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs opacity-60">{hint}</p> : null}
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

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${statusBadgeClass(status)}`}>{statusLabel(status)}</span>;
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm opacity-70">{description}</p> : null}
      </div>
      {actions}
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

export function DataTable({
  headers,
  children,
}: {
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100">
      <table className="table table-sm">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

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
