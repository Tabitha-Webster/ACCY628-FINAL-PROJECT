"use client";

import { useRef, useState } from "react";
import { roleHomePath, type UserRole } from "@/lib/constants";
import { isDemoModeEnabled } from "@/lib/demo-mode";
import { switchDemoRole } from "@/lib/demo-switch";

/**
 * Opens the selected role's home/dashboard by signing into that demo account.
 */
export function ViewRoleDashboardButton({ role }: { role: UserRole }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  async function onShow() {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setBusy(true);
    setError(null);

    if (!isDemoModeEnabled()) {
      inFlightRef.current = false;
      setBusy(false);
      setError("Turn on Demo Mode to open another role’s dashboard.");
      return;
    }

    const result = await switchDemoRole(role);
    if (!result.ok) {
      inFlightRef.current = false;
      setBusy(false);
      setError(result.error);
      return;
    }

    window.location.assign(result.homePath || roleHomePath(role));
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        className="btn btn-xs btn-outline"
        disabled={busy}
        onClick={() => void onShow()}
      >
        {busy ? "Opening…" : "Visit"}
      </button>
      {error ? <span className="max-w-[14rem] text-xs text-error">{error}</span> : null}
    </div>
  );
}
