/**
 * Client-safe Demo Mode flag for class walkthroughs.
 * On by default for this course project so teammates get password-free role
 * switching without each copying a local env flag. Set
 * NEXT_PUBLIC_DEMO_MODE=false to require normal passwords.
 */
export function isDemoModeEnabled() {
  const value = process.env.NEXT_PUBLIC_DEMO_MODE?.trim().toLowerCase();
  if (value === undefined || value === "") return true;
  return value === "true" || value === "1";
}
