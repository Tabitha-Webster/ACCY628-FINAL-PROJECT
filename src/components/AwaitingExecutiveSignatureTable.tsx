"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { StatusBadge } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import {
  daysWaitingForExecutiveSignature,
  EXECUTIVE_SIGNATURE_OVERDUE_DAYS,
  type AwaitingExecutiveSignatureItem,
} from "@/lib/contracts/executive-waiting";

type SortOrder = "oldest" | "newest";

function waitingLabel(days: number | null): string {
  if (days == null) return "—";
  if (days <= 0) return "Today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

export function AwaitingExecutiveSignatureTable({
  items,
}: {
  items: AwaitingExecutiveSignatureItem[];
}) {
  const [sortOrder, setSortOrder] = useState<SortOrder>("oldest");
  const now = useMemo(() => new Date(), []);

  const sorted = useMemo(() => {
    const copy = [...items];
    copy.sort((a, b) => {
      const aMs = a.waitingSince ? new Date(a.waitingSince).getTime() : Number.POSITIVE_INFINITY;
      const bMs = b.waitingSince ? new Date(b.waitingSince).getTime() : Number.POSITIVE_INFINITY;
      const aSafe = Number.isNaN(aMs) ? Number.POSITIVE_INFINITY : aMs;
      const bSafe = Number.isNaN(bMs) ? Number.POSITIVE_INFINITY : bMs;
      return sortOrder === "oldest" ? aSafe - bSafe : bSafe - aSafe;
    });
    return copy;
  }, [items, sortOrder]);

  const overdueCount = useMemo(
    () =>
      items.filter((item) => {
        const days = daysWaitingForExecutiveSignature(item.waitingSince, now);
        return days != null && days > EXECUTIVE_SIGNATURE_OVERDUE_DAYS;
      }).length,
    [items, now]
  );

  const readyCount = items.filter((item) => item.readyToSign).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm opacity-70">
          {readyCount} ready to sign
          {items.length > readyCount
            ? ` · ${items.length - readyCount} still need a manager signature packet`
            : ""}
          {overdueCount > 0 ? (
            <span className="ml-2 inline-flex items-center gap-1 font-medium text-error">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              {overdueCount} waiting over {EXECUTIVE_SIGNATURE_OVERDUE_DAYS} days
            </span>
          ) : null}
        </p>
        <label className="flex items-center gap-2 text-sm">
          <span className="opacity-70">Sort</span>
          <select
            className="select select-bordered select-sm"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
            aria-label="Sort by waiting time"
          >
            <option value="oldest">Oldest to newest</option>
            <option value="newest">Newest to oldest</option>
          </select>
        </label>
      </div>

      <div className="overflow-x-auto rounded-box border border-base-300">
        <table className="table">
          <thead>
            <tr>
              <th>Contract</th>
              <th>Customer</th>
              <th>Manager</th>
              <th>Manager signed</th>
              <th>Waiting</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => {
              const days = daysWaitingForExecutiveSignature(item.waitingSince, now);
              const overdue = days != null && days > EXECUTIVE_SIGNATURE_OVERDUE_DAYS;
              return (
                <tr key={item.id} className={overdue ? "bg-error/10" : undefined}>
                  <td>
                    <div className="flex flex-wrap items-start gap-2">
                      <div>
                        <p className="font-medium">{item.contractNumber}</p>
                        <p className="text-xs opacity-60">{item.contractName}</p>
                      </div>
                      {overdue ? (
                        <span className="badge badge-error badge-sm gap-1">
                          <AlertTriangle className="h-3 w-3" aria-hidden />
                          Over {EXECUTIVE_SIGNATURE_OVERDUE_DAYS} days
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td>{item.customerName}</td>
                  <td>{item.managerName}</td>
                  <td className="text-sm tabular-nums">{formatDateTime(item.signedAt)}</td>
                  <td>
                    <span
                      className={`text-sm tabular-nums ${overdue ? "font-semibold text-error" : ""}`}
                    >
                      {waitingLabel(days)}
                    </span>
                  </td>
                  <td>
                    <StatusBadge
                      status={item.readyToSign ? "awaiting_executive" : "pending_approval"}
                      label={item.readyToSign ? "Ready to sign" : "Needs manager packet"}
                    />
                  </td>
                  <td className="text-right">
                    <Link
                      href={`/contracts/${item.contractId}#pdf-signatures`}
                      className={`btn btn-sm ${overdue ? "btn-error" : "btn-primary"}`}
                    >
                      {item.readyToSign ? "Review & sign" : "Open contract"}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
