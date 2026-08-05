import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui";

export type TableAlign = "left" | "right" | "center";

export type TableColumn = {
  key: string;
  header: string;
  align?: TableAlign;
  /** Use tabular figures and right alignment by default for numeric columns. */
  numeric?: boolean;
  className?: string;
};

const alignClass: Record<TableAlign, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

function columnAlign(column: TableColumn): TableAlign {
  if (column.align) return column.align;
  return column.numeric ? "right" : "left";
}

function columnClassName(column: TableColumn) {
  const parts = [alignClass[columnAlign(column)]];
  if (column.numeric) parts.push("tabular-nums");
  if (column.className) parts.push(column.className);
  return parts.join(" ");
}

type TableProps = {
  columns: TableColumn[];
  children?: ReactNode;
  /** When true (or when there are no row children), show the empty state instead of the table body. */
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
};

/**
 * Shared data table — headers, rows, empty state, horizontal scroll, and aligned cells.
 * Prefer this for new customer-module tables; existing DataTable usages stay unchanged.
 */
export function Table({
  columns,
  children,
  isEmpty = false,
  emptyTitle = "No records yet",
  emptyDescription,
  className = "",
}: TableProps) {
  if (isEmpty) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div
      className={`app-table-wrap overflow-x-auto rounded-box border border-base-300 bg-base-100 ${className}`.trim()}
    >
      <table className="table table-sm w-full min-w-[40rem]">
        <thead>
          <tr className="border-b border-base-300">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`bg-base-200/60 text-xs font-semibold uppercase tracking-wide opacity-70 ${columnClassName(column)}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

type TableCellProps = {
  children: ReactNode;
  align?: TableAlign;
  numeric?: boolean;
  className?: string;
  title?: string;
  /** Mark the trailing actions column for consistent right alignment. */
  actions?: boolean;
};

export function TableCell({
  children,
  align,
  numeric = false,
  className = "",
  title,
  actions = false,
}: TableCellProps) {
  const resolvedAlign: TableAlign = align ?? (actions || numeric ? "right" : "left");
  const classes = [
    "align-middle",
    alignClass[resolvedAlign],
    numeric ? "tabular-nums" : "",
    actions ? "whitespace-nowrap" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <td className={classes} title={title}>
      {children}
    </td>
  );
}
