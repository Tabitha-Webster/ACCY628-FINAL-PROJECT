"use client";

import { Children, isValidElement, useMemo, useState, type ReactElement, type ReactNode } from "react";
import {
  type CompareOp,
  CompareFilter,
  DropdownHeader,
  FilterOption,
  TextFilter,
  matchesCompare,
  matchesText,
  useHeaderFilter,
} from "@/components/table-filters";

function extractText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join(" ").replace(/\s+/g, " ").trim();
  if (isValidElement(node)) {
    const props = node.props as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof props.status === "string") parts.push(props.status.replace(/_/g, " "));
    if (typeof props.value === "number" || typeof props.value === "string") parts.push(String(props.value));
    if ("children" in props) parts.push(extractText(props.children as ReactNode));
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }
  return "";
}

function parseNumeric(text: string) {
  const cleaned = text.replace(/[^0-9.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === "-.") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

type ColumnFilter = {
  query: string;
  selected: string;
  op: CompareOp;
  amount: string;
};

const EMPTY_FILTER: ColumnFilter = { query: "", selected: "all", op: "gt", amount: "" };

export function DataTable({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  const { openFilter, setOpenFilter, toggleFilter, tableRef } = useHeaderFilter<string>();
  const [filters, setFilters] = useState<ColumnFilter[]>(() => headers.map(() => ({ ...EMPTY_FILTER })));

  const rows = useMemo(
    () => Children.toArray(children).filter((child): child is ReactElement<{ children?: ReactNode }> => isValidElement(child)),
    [children]
  );

  const columnTexts = useMemo(
    () =>
      headers.map((_, colIdx) =>
        rows.map((row) => {
          const cells = Children.toArray(row.props.children);
          return extractText(cells[colIdx]);
        })
      ),
    [headers, rows]
  );

  const numericColumns = useMemo(
    () =>
      columnTexts.map((values) => {
        const usable = values.filter(Boolean);
        if (usable.length === 0) return false;
        return usable.filter((value) => parseNumeric(value) != null).length / usable.length >= 0.6;
      }),
    [columnTexts]
  );

  const filteredRows = useMemo(
    () =>
      rows.filter((_, rowIdx) =>
        headers.every((_, colIdx) => {
          const filter = filters[colIdx] ?? EMPTY_FILTER;
          const text = columnTexts[colIdx]?.[rowIdx] ?? "";
          if (!matchesText(text, filter.query)) return false;
          if (filter.selected !== "all" && text.trim().toLowerCase() !== filter.selected.trim().toLowerCase()) return false;
          if (numericColumns[colIdx] && filter.amount.trim()) {
            const amount = parseNumeric(text);
            if (amount == null || !matchesCompare(amount, filter.op, filter.amount)) return false;
          }
          return true;
        })
      ),
    [rows, headers, filters, columnTexts, numericColumns]
  );

  function updateFilter(colIdx: number, patch: Partial<ColumnFilter>) {
    setFilters((current) => current.map((filter, idx) => (idx === colIdx ? { ...filter, ...patch } : filter)));
  }

  return (
    <div ref={tableRef} className="filter-table-scroll overflow-auto rounded-box border border-base-300 bg-base-100">
      <table className="filter-table w-full border-separate border-spacing-0 text-left text-sm">
        <thead>
          <tr>
            {headers.map((header, colIdx) => {
              const filter = filters[colIdx] ?? EMPTY_FILTER;
              const values = uniqueValues(columnTexts[colIdx] ?? []).slice(0, 8);
              const isNumeric = numericColumns[colIdx];
              const active = Boolean(filter.query.trim()) || filter.selected !== "all" || Boolean(filter.amount.trim());
              const label = header.trim() || "Filter";
              return (
                <DropdownHeader
                  key={`${header}-${colIdx}`}
                  label={label}
                  active={active}
                  open={openFilter === String(colIdx)}
                  align={colIdx >= headers.length - 2 ? "right" : "left"}
                  onToggle={() => toggleFilter(String(colIdx))}
                >
                  {isNumeric ? (
                    <CompareFilter
                      op={filter.op}
                      value={filter.amount}
                      onOpChange={(op) => updateFilter(colIdx, { op })}
                      onValueChange={(amount) => updateFilter(colIdx, { amount })}
                    />
                  ) : values.length > 0 && values.length <= 8 ? (
                    <>
                      <FilterOption selected={filter.selected === "all"} onClick={() => updateFilter(colIdx, { selected: "all" })}>
                        (All)
                      </FilterOption>
                      {values.map((value) => (
                        <FilterOption
                          key={value}
                          selected={filter.selected.toLowerCase() === value.toLowerCase()}
                          onClick={() => {
                            updateFilter(colIdx, { selected: value });
                            setOpenFilter(null);
                          }}
                        >
                          <span className="block truncate">{value}</span>
                        </FilterOption>
                      ))}
                    </>
                  ) : (
                    <TextFilter
                      value={filter.query}
                      onChange={(query) => updateFilter(colIdx, { query })}
                      placeholder={`Search ${label.toLowerCase()}`}
                    />
                  )}
                </DropdownHeader>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {filteredRows.length === 0 ? (
            <tr>
              <td colSpan={Math.max(headers.length, 1)} className="py-8 text-center opacity-70">
                No records match these filters.
              </td>
            </tr>
          ) : (
            filteredRows
          )}
        </tbody>
      </table>
    </div>
  );
}
