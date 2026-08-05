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
    <div className="rounded-box border border-base-300 bg-base-100 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-60">
        Contract actions
      </h2>
      <div className="flex flex-wrap gap-2">
        {visible.map((item) =>
          item.allowed ? (
            <Link
              key={item.permission}
              href={item.href}
              className="btn btn-sm btn-outline"
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
      <p className="mt-3 text-xs opacity-60">
        Create opens the new-contract form. Edit, Delete, Approve, and Cancel take you to the matching
        list filter — open a contract to finish the action. Renew and Reporting open their dedicated pages.
      </p>
    </div>
  );
}
