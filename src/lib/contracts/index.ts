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
 *
 * Billing integration: getContractBillingTerms / listContractsForBilling
 * expose MRR, frequency, method, invoice terms, hours, overages, invoice
 * dates, and billing status for Ready to Bill and contract-to-cash.
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
export * from "./permissions";
export * from "./warnings";
export * from "./queries";
export * from "./validation";
export * from "./audit";
export * from "./renewals";
export * from "./billing";
export * from "./reporting";
export * from "./reportQueries";



