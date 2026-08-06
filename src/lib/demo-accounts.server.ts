import "server-only";

import { DEMO_ACCOUNTS, type UserRole } from "@/lib/constants";

/**
 * Server-only demo credentials. Never import this module from client components.
 * Override with DEMO_ACCOUNT_PASSWORD in .env.local if needed.
 */
const DEMO_PASSWORD = process.env.DEMO_ACCOUNT_PASSWORD || "1234";

const PASSWORDS: Record<string, string> = Object.fromEntries(
  DEMO_ACCOUNTS.map((account) => [account.email.toLowerCase(), DEMO_PASSWORD])
);

export function getDemoCredentialsForRole(role: UserRole) {
  const account = DEMO_ACCOUNTS.find((row) => row.role === role);
  if (!account) return null;
  const password = PASSWORDS[account.email.toLowerCase()];
  if (!password) return null;
  return {
    role: account.role,
    label: account.label,
    email: account.email,
    password,
  };
}

export function isKnownDemoRole(role: string): role is UserRole {
  return DEMO_ACCOUNTS.some((account) => account.role === role);
}
