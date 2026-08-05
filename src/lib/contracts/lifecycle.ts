import type { ContractStatus } from "@/lib/types";
import type { UserRole } from "@/lib/constants";
import { CONTRACT_STATUS_LABELS } from "./constants";

/**
 * Allowed status transitions for the contract lifecycle.
 * Future UI actions (submit, approve, activate, hold, cancel, renew, expire)
 * should call through canTransition / getNextStatuses.
 */
export const CONTRACT_TRANSITIONS: Record<ContractStatus, readonly ContractStatus[]> = {
  draft: ["pending_approval", "canceled"],
  pending_approval: ["active", "draft", "canceled"],
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
};

const ACTION_META: Partial<Record<ContractStatus, { label: string; description: string }>> = {
  draft: { label: "Return to Draft", description: "Send back for edits before approval." },
  pending_approval: {
    label: "Submit for Approval",
    description: "Route the agreement for customer and/or manager approval.",
  },
  active: {
    label: "Activate",
    description: "Make the agreement live for support, billing, and technicians.",
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
    label: "Cancel",
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
  return getNextStatuses(from).map((to) => ({
    to,
    label: ACTION_META[to]?.label ?? CONTRACT_STATUS_LABELS[to],
    description: ACTION_META[to]?.description ?? `Move to ${CONTRACT_STATUS_LABELS[to]}.`,
  }));
}

export function isOperationalStatus(status: ContractStatus): boolean {
  return (OPERATIONAL_CONTRACT_STATUSES as readonly string[]).includes(status);
}

export function isTerminalStatus(status: ContractStatus): boolean {
  return (TERMINAL_CONTRACT_STATUSES as readonly string[]).includes(status);
}

/** Roles that may view the internal Contracts & Agreements module. */
export function canViewContractsModule(role: UserRole): boolean {
  return role === "manager" || role === "billing" || role === "technician";
}

/** Managers own create / update / lifecycle changes (matches RLS). */
export function canManageContracts(role: UserRole): boolean {
  return role === "manager";
}

/** Billing consumes contract terms for invoicing; read-heavy. */
export function canUseContractsForBilling(role: UserRole): boolean {
  return role === "manager" || role === "billing";
}
