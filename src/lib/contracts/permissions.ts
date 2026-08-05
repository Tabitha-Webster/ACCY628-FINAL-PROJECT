import type { UserRole } from "@/lib/constants";
import type { ContractStatus } from "@/lib/types";

/**
 * Contract module capabilities.
 * Enforced in UI; managers also match Supabase RLS for writes.
 */
export type ContractPermission =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "approve"
  | "renew"
  | "cancel"
  | "report";

const ALL_INTERNAL: UserRole[] = ["manager", "billing", "technician"];

/**
 * Role → allowed contract actions.
 *
 * Manager: full lifecycle + reporting
 * Billing: view + reporting (billing terms / cash)
 * Technician: view operational agreements
 * Customer: own agreements via /my-contracts (view only)
 */
export const CONTRACT_PERMISSIONS: Record<ContractPermission, readonly UserRole[]> = {
  view: [...ALL_INTERNAL, "customer"],
  create: ["manager"],
  edit: ["manager"],
  delete: ["manager"],
  approve: ["manager"],
  renew: ["manager"],
  cancel: ["manager"],
  report: ["manager", "billing"],
};

export function hasContractPermission(role: UserRole, permission: ContractPermission): boolean {
  return CONTRACT_PERMISSIONS[permission].includes(role);
}

export function getContractPermissions(role: UserRole): Record<ContractPermission, boolean> {
  return {
    view: hasContractPermission(role, "view"),
    create: hasContractPermission(role, "create"),
    edit: hasContractPermission(role, "edit"),
    delete: hasContractPermission(role, "delete"),
    approve: hasContractPermission(role, "approve"),
    renew: hasContractPermission(role, "renew"),
    cancel: hasContractPermission(role, "cancel"),
    report: hasContractPermission(role, "report"),
  };
}

/** Internal Contracts & Agreements list/detail (not customer portal). */
export function canViewContractsModule(role: UserRole): boolean {
  return role === "manager" || role === "billing" || role === "technician";
}

export function canCreateContracts(role: UserRole): boolean {
  return hasContractPermission(role, "create");
}

export function canEditContracts(role: UserRole): boolean {
  return hasContractPermission(role, "edit");
}

export function canDeleteContracts(role: UserRole): boolean {
  return hasContractPermission(role, "delete");
}

export function canApproveContracts(role: UserRole): boolean {
  return hasContractPermission(role, "approve");
}

export function canRenewContracts(role: UserRole): boolean {
  return hasContractPermission(role, "renew");
}

export function canCancelContracts(role: UserRole): boolean {
  return hasContractPermission(role, "cancel");
}

export function canViewContractReports(role: UserRole): boolean {
  return hasContractPermission(role, "report");
}

/** Any write/lifecycle capability (create/edit/delete/approve/renew/cancel). */
export function canManageContracts(role: UserRole): boolean {
  return (
    canCreateContracts(role) ||
    canEditContracts(role) ||
    canDeleteContracts(role) ||
    canApproveContracts(role) ||
    canRenewContracts(role) ||
    canCancelContracts(role)
  );
}

export function canUseContractsForBilling(role: UserRole): boolean {
  return role === "manager" || role === "billing";
}

/** Map a target status change to the permission required. */
export function permissionForStatusTransition(to: ContractStatus): ContractPermission | null {
  switch (to) {
    case "pending_approval":
      return "edit";
    case "active":
      return "approve";
    case "draft":
      return "edit";
    case "on_hold":
      return "edit";
    case "expired":
      return "edit";
    case "canceled":
      return "cancel";
    case "renewed":
      return "renew";
    default:
      return null;
  }
}

/** Hard delete is limited to non-operational drafts (and canceled shells). */
export function canDeleteContractRecord(
  role: UserRole,
  status: ContractStatus
): boolean {
  if (!canDeleteContracts(role)) return false;
  return status === "draft" || status === "canceled";
}

export const CONTRACT_PERMISSION_LABELS: Record<ContractPermission, string> = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  approve: "Approve",
  renew: "Renew",
  cancel: "Cancel",
  report: "Reporting & Dashboard",
};

export function describeContractPermissions(role: UserRole): Array<{
  permission: ContractPermission;
  label: string;
  allowed: boolean;
}> {
  return (Object.keys(CONTRACT_PERMISSION_LABELS) as ContractPermission[]).map((permission) => ({
    permission,
    label: CONTRACT_PERMISSION_LABELS[permission],
    allowed: hasContractPermission(role, permission),
  }));
}
