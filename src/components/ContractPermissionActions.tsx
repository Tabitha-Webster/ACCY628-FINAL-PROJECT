import Link from "next/link";
import type { ContractPermission } from "@/lib/contracts/permissions";

type Item = {
  permission: ContractPermission;
  label: string;
  allowed: boolean;
  href: string;
};

const HINTS: Partial<Record<ContractPermission, string>> = {
  create: "Start a new service agreement",
  edit: "Open draft agreements to edit",
  delete: "Open draft agreements (delete from the detail page)",
  approve: "Open agreements waiting for approval",
  renew: "Renewal reminders and expiration",
  cancel: "Open active agreements (cancel from the detail page)",
  report: "Portfolio metrics and reporting",
};

export function ContractPermissionActions({
  items,
  showDenied = false,
}: {
  items: Item[];
  showDenied?: boolean;
}) {
  const visible = (showDenied ? items : items.filter((item) => item.allowed)).filter(
    (item) => item.permission !== "view"
  );

  if (visible.length === 0) return null;

  return (
    <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50/70 to-base-100 p-3 shadow-sm">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-900/80">
        Contract actions
      </h2>
      <div className="flex flex-wrap gap-2">
        {visible.map((item) =>
          item.allowed ? (
            <Link
              key={item.permission}
              href={item.href}
              className="btn btn-sm border-emerald-200 bg-white/80 hover:bg-emerald-50"
              title={HINTS[item.permission]}
            >
              {item.label}
            </Link>
          ) : (
            <span
              key={item.permission}
              className="btn btn-sm btn-disabled"
              title="Not available for your role"
            >
              {item.label}
            </span>
          )
        )}
      </div>
    </div>
  );
}
