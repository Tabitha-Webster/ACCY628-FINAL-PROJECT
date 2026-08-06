"use client";

import type { ReactNode } from "react";
import { downloadCsv, toCsv } from "@/lib/csv";

type Props = {
  filename: string;
  headers: string[];
  rows: (string | number | boolean | null | undefined)[][];
  label?: ReactNode;
  className?: string;
};

export function CsvExportButton({
  filename,
  headers,
  rows,
  label = "Export CSV",
  className = "btn btn-sm btn-outline",
}: Props) {
  return (
    <button
      type="button"
      className={className}
      disabled={rows.length === 0}
      onClick={() => downloadCsv(filename, toCsv(headers, rows))}
    >
      {label}
    </button>
  );
}
