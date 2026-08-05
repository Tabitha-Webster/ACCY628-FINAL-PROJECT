/**
 * Contracts & Agreements module
 *
 * Owns contract lifecycle rules, list/detail data access, control warnings,
 * and integration hooks for billing, customers, technicians, and reporting.
 *
 * Pages live under:
 * - /contracts, /contracts/[id]  (internal)
 * - /my-contracts                (customer)
 *
 * Add create/edit/approval UI components next; call canTransition /
 * getLifecycleActions and the query helpers from this package.
 */

export type {
  Contract,
  ContractModification,
  ContractService,
  ContractDocument,
  ContractVersion,
  ContractChange,
  ContractStatus,
  ContractType,
  RenewalType,
  BillingFrequency,
  BillingTiming,
} from "@/lib/types";

export * from "./constants";
export * from "./dates";
export * from "./lifecycle";
export * from "./warnings";
export * from "./queries";
export * from "./validation";
export * from "./audit";



