"use client";

import { useId, useRef } from "react";

export type MetricExplainLine = {
  label: string;
  value: string;
  detail?: string;
};

export type MetricExplanation = {
  title: string;
  result: string;
  formula: string;
  description?: string;
  lines?: MetricExplainLine[];
};

export function ExplainNumber({ explanation }: { explanation: MetricExplanation }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-xs mt-2 h-auto min-h-0 px-0 font-normal normal-case opacity-70 hover:bg-transparent hover:opacity-100"
        onClick={() => dialogRef.current?.showModal()}
      >
        Explain this number
      </button>
      <dialog ref={dialogRef} className="modal" aria-labelledby={titleId}>
        <div className="modal-box max-w-lg">
          <h3 id={titleId} className="text-lg font-semibold">
            {explanation.title}
          </h3>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{explanation.result}</p>
          <p className="mt-3 text-sm">
            <span className="font-medium">Calculation: </span>
            {explanation.formula}
          </p>
          {explanation.description ? <p className="mt-2 text-sm opacity-70">{explanation.description}</p> : null}
          {explanation.lines?.length ? (
            <div className="mt-4 max-h-72 overflow-auto rounded-box border border-base-300">
              <table className="table table-xs">
                <thead>
                  <tr>
                    <th>Value used</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {explanation.lines.map((line, index) => (
                    <tr key={`${line.label}-${index}`}>
                      <td>
                        <div>{line.label}</div>
                        {line.detail ? <div className="opacity-60">{line.detail}</div> : null}
                      </td>
                      <td className="text-right tabular-nums">{line.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm opacity-60">No detail rows are included in this total.</p>
          )}
          <div className="modal-action">
            <form method="dialog">
              <button className="btn btn-sm">Close</button>
            </form>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>
    </>
  );
}
