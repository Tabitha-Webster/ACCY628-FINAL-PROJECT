import type { ContractStatus } from "@/lib/types";
import type { UserRole } from "@/lib/constants";
import { CONTRACT_STATUS_LABELS } from "./constants";
import {
  canApproveContracts,
  canCancelContracts,
  canEditContracts,
  canRenewContracts,
  permissionForStatusTransition,
} from "./permissions";

/**
 * Allowed status transitions for the contract lifecycle.
 * Activation from pending is not a manual action — it happens only after
 * Manager → Executive → Customer PDF signatures (finalize RPC).
 */
export const CONTRACT_TRANSITIONS: Record<ContractStatus, readonly ContractStatus[]> = {
  draft: ["canceled"],
  pending_approval: ["draft", "canceled"],
  active: ["on_hold", "expired", "canceled", "renewed"],
  on_hold: ["active", "canceled", "expired"],
  expired: ["renewed", "canceled"],
  canceled: [],
  renewed: ["active"],
};

/** Statuses that can still drive operations / billing consumption. */
export const OPERATIONAL_CONTRACT_STATUSES: readonly ContractStatus[] = ["active"] as const;

/** Statuses considered closed for new work. */
export const TERMINAL_CONTRACT_STATUSES: readonly ContractStatus[] = [
  "expired",
  "canceled",
  "renewed",
] as const;

export type LifecycleAction = {
  to: ContractStatus;
  label: string;
  description: string;
  permission: NonNullable<ReturnType<typeof permissionForStatusTransition>>;
};

const ACTION_META: Partial<Record<ContractStatus, { label: string; description: string }>> = {
  draft: {
    label: "Return to Draft",
    description: "Send back for edits. The manager can restart the PDF signature packet afterward.",
  },
  pending_approval: {
    label: "Submit for Executive Signature",
    description: "Use PDF Signatures: manager signs, then the executive, then the customer.",
  },
  active: {
    label: "Reactivate",
    description: "Return a suspended or renewed agreement to active service.",
  },
  on_hold: {
    label: "Place On Hold",
    description: "Pause service delivery without canceling the agreement.",
  },
  expired: {
    label: "Mark Expired",
    description: "Close the term after the end date without renewal.",
  },
  canceled: {
    label: "Cancel Contract",
    description: "Terminate the agreement early.",
  },
  renewed: {
    label: "Mark Renewed",
    description: "Record that a successor agreement replaces this one.",
  },
};

export function canTransition(from: ContractStatus, to: ContractStatus): boolean {
  return CONTRACT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getNextStatuses(from: ContractStatus): ContractStatus[] {
  return [...(CONTRACT_TRANSITIONS[from] ?? [])];
}

export function getLifecycleActions(from: ContractStatus): LifecycleAction[] {
  return getNextStatuses(from)
    .map((to) => {
      const permission = permissionForStatusTransition(to);
      if (!permission) return null;
      return {
        to,
        label: ACTION_META[to]?.label ?? CONTRACT_STATUS_LABELS[to],
        description: ACTION_META[to]?.description ?? `Move to ${CONTRACT_STATUS_LABELS[to]}.`,
        permission,
      };
    })
    .filter((action): action is LifecycleAction => action != null);
}

/** Lifecycle actions the current role is allowed to perform. */
export function getLifecycleActionsForRole(
  from: ContractStatus,
  role: UserRole
): LifecycleAction[] {
  return getLifecycleActions(from).filter((action) => {
    switch (action.permission) {
      case "approve":
        return canApproveContracts(role);
      case "cancel":
        return canCancelContracts(role);
      case "renew":
        return canRenewContracts(role);
      case "edit":
        return canEditContracts(role);
      default:
        return false;
    }
  });
}

export function isOperationalStatus(status: ContractStatus): boolean {
  return (OPERATIONAL_CONTRACT_STATUSES as readonly string[]).includes(status);
}

export function isTerminalStatus(status: ContractStatus): boolean {
  return (TERMINAL_CONTRACT_STATUSES as readonly string[]).includes(status);
}