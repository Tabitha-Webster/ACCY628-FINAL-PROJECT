/**
 * Contracts & Agreements module
 *
 * Owns contract lifecycle rules, list/detail data access, control warnings,
 * renewal reminders / history, and integration hooks for billing, customers,
 * technicians, and reporting.
 *
 * Pages live under:
 * - /contracts, /contracts/[id], /contracts/renewals  (internal)
 * - /my-contracts                (customer)
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
export * from "./renewals";



