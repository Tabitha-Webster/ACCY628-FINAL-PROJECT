/** Pure helpers for executive signature queue timing (safe for client components). */

export const EXECUTIVE_SIGNATURE_OVERDUE_DAYS = 10;

export type AwaitingExecutiveSignatureItem = {
  id: string;
  contractId: string;
  contractNumber: string;
  contractName: string;
  customerName: string;
  managerName: string;
  /** When the manager signed / the item entered the executive queue. */
  signedAt: string | null;
  /** Best timestamp for how long it has been waiting on the executive. */
  waitingSince: string | null;
  readyToSign: boolean;
};

/** Calendar days waiting for executive signature (null if unknown). */
export function daysWaitingForExecutiveSignature(
  waitingSince: string | null,
  now: Date = new Date()
): number | null {
  if (!waitingSince) return null;
  const start = new Date(waitingSince);
  if (Number.isNaN(start.getTime())) return null;
  const ms = now.getTime() - start.getTime();
  if (ms < 0) return 0;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}
