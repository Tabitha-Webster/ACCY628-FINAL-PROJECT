/**
 * Renewal decision date for renewable agreements.
 * Schema has no renewal_date column — end_date is the renewal horizon when renewal_type is auto/manual.
 */
export function getContractRenewalDate(contract: {
  end_date: string | null;
  renewal_type: string | null;
}): string | null {
  if (!contract.end_date) return null;
  const renewal = (contract.renewal_type ?? "none").toLowerCase();
  if (renewal === "none") return null;
  return contract.end_date;
}
