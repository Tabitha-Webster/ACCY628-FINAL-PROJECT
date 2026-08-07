"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DateText, Money, StatusBadge } from "@/components/ui";

export type CustomerProjectSummaryData = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  customer_approval_status: string | null;
  start_date: string | null;
  target_completion_date: string | null;
  fixed_fee: number | null;
  estimated_billing_amount: number | null;
  amount_billed: number | null;
  amount_collected: number | null;
  contract: {
    contract_number: string;
    name: string;
    start_date: string | null;
    end_date: string | null;
    status: string | null;
  } | null;
};

export function CustomerProjectNameButton({ project }: { project: CustomerProjectSummaryData }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const revenue = Number(project.fixed_fee ?? 0) || Number(project.estimated_billing_amount ?? 0);

  const modal =
    mounted && open
      ? createPortal(
          <div className="modal modal-open" style={{ zIndex: 80 }}>
            <div className="modal-box max-w-lg rounded-2xl shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold tracking-tight text-base-content">{project.name}</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <StatusBadge status={project.status} />
                    {project.customer_approval_status ? (
                      <StatusBadge status={project.customer_approval_status} />
                    ) : null}
                  </div>
                </div>
                <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={() => setOpen(false)} aria-label="Close">
                  ✕
                </button>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-base-content/90">
                {project.description?.trim() || "No description provided for this project."}
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-base-300 bg-base-200/40 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-base-content/60">Start</p>
                  <p className="mt-1 text-sm font-medium">
                    {project.start_date ? <DateText value={project.start_date} /> : "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-base-300 bg-base-200/40 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-base-content/60">Target completion</p>
                  <p className="mt-1 text-sm font-medium">
                    {project.target_completion_date ? (
                      <DateText value={project.target_completion_date} />
                    ) : (
                      "—"
                    )}
                  </p>
                </div>
                <div className="rounded-xl border border-base-300 bg-base-200/40 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-base-content/60">Est. billing</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums">
                    <Money value={revenue} />
                  </p>
                </div>
                <div className="rounded-xl border border-base-300 bg-base-200/40 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-base-content/60">Billed / collected</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums">
                    <Money value={Number(project.amount_billed ?? 0)} /> /{" "}
                    <Money value={Number(project.amount_collected ?? 0)} />
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-base-300 bg-base-200/40 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-base-content/60">Contract</p>
                {project.contract ? (
                  <div className="mt-1 space-y-1 text-sm">
                    <p className="font-medium text-base-content">
                      {project.contract.contract_number} · {project.contract.name}
                    </p>
                    <p className="text-base-content/80">
                      {project.contract.status ? (
                        <>
                          Status: <StatusBadge status={project.contract.status} />
                        </>
                      ) : null}
                    </p>
                    <p className="text-base-content/80">
                      Term:{" "}
                      {project.contract.start_date ? <DateText value={project.contract.start_date} /> : "—"}
                      {" → "}
                      {project.contract.end_date ? <DateText value={project.contract.end_date} /> : "Open"}
                    </p>
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-base-content/70">No linked contract.</p>
                )}
              </div>

              <div className="modal-action">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(false)}>
                  Close
                </button>
              </div>
            </div>
            <button type="button" className="modal-backdrop bg-black/50" aria-label="Close dialog" onClick={() => setOpen(false)} />
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        type="button"
        className="link link-hover max-w-full truncate text-left font-semibold text-base-content"
        onClick={() => setOpen(true)}
      >
        {project.name}
      </button>
      {modal}
    </>
  );
}
