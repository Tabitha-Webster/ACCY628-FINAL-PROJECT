/** Client-safe Demo Mode flag for class walkthroughs. */
export function isDemoModeEnabled() {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}
