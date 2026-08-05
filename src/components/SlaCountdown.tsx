"use client";

import { useEffect, useState } from "react";
import { SlaConditionBadge } from "@/components/SlaBadges";
import { slaCountdownView, type SlaCondition } from "@/lib/sla";

type Props = {
  label: string;
  submittedAt?: string | null;
  targetAt: string | null | undefined;
  satisfiedAt: string | null | undefined;
  status?: string | null;
  kind: "response" | "resolution";
  /** Refresh interval in ms (default 15s). */
  intervalMs?: number;
};

/** Client clock that updates on an interval without unstable getSnapshot values. */
function useNow(intervalMs: number) {
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return nowMs;
}

/**
 * Live SLA countdown for technician workspace cards.
 * Starts at 0 on the server; client fills in after mount.
 */
export function SlaCountdown({
  label,
  submittedAt,
  targetAt,
  satisfiedAt,
  status,
  kind,
  intervalMs = 15000,
}: Props) {
  const nowMs = useNow(intervalMs);
  const mounted = nowMs > 0;
  const view = slaCountdownView({
    submittedAt,
    targetAt,
    satisfiedAt,
    status,
    kind,
    now: mounted ? new Date(nowMs) : undefined,
  });

  const tone =
    view.overdue || view.condition === "missed"
      ? "text-error"
      : view.condition === "at_risk"
        ? "text-warning"
        : "opacity-80";

  return (
    <div className="rounded-box border border-base-300/80 bg-base-100/60 px-2.5 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide opacity-60">{label}</p>
        <SlaConditionBadge condition={view.condition as SlaCondition} />
      </div>
      {!mounted ? (
        <p className="mt-1 text-xs opacity-50" aria-hidden>
          …
        </p>
      ) : (
        <p className={`mt-1 text-xs font-medium tabular-nums ${tone}`} role="status">
          <span className="mr-1" aria-hidden>
            {view.icon}
          </span>
          {view.text}
          {view.stopped ? (
            <span className="sr-only"> Countdown stopped because the requirement is complete.</span>
          ) : null}
        </p>
      )}
    </div>
  );
}
