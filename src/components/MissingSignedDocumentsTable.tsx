import Link from "next/link";
import { DataTable, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { unwrapAssignedManager, unwrapCustomer } from "@/lib/contracts";

export type MissingSignedDocumentRow = {
  id: string;
  contract_number: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  other_document_count: number;
  customers: { id: string; name: string } | { id: string; name: string }[] | null;
  assigned_manager: { full_name: string } | { full_name: string }[] | null;
};

type Props = {
  rows: MissingSignedDocumentRow[];
};

/** Active contracts missing a current signed agreement — shown on Manage Contracts. */
export function MissingSignedDocumentsTable({ rows }: Props) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
            Document checklist
          </h2>
          <p className="text-sm opacity-70">
            Active contracts missing a current signed agreement on file.
          </p>
        </div>
        <span
          className={`badge badge-sm ${rows.length ? "badge-error" : "badge-success"}`}
        >
          {rows.length} missing
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="All active contracts have a signed agreement"
          description="Current signed_contract documents are on file for every active agreement."
        />
      ) : (
        <DataTable
          headers={["Contract", "Customer", "Account manager", "Term", "Other docs", ""]}
        >
          {rows.map((row) => {
            const customer = unwrapCustomer(row);
            const manager = unwrapAssignedManager(row);
            return (
              <tr key={row.id}>
                <td>
                  <Link href={`/contracts/${row.id}`} className="link link-hover font-medium">
                    {row.contract_number}
                  </Link>
                  <div className="text-xs opacity-60">{row.name}</div>
                </td>
                <td>
                  {customer ? (
                    <Link href={`/customers/${customer.id}`} className="link link-hover">
                      {customer.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td>{manager?.full_name ?? "—"}</td>
                <td className="whitespace-nowrap text-xs">
                  {formatDate(row.start_date)} → {formatDate(row.end_date)}
                </td>
                <td>
                  {row.other_document_count > 0 ? `${row.other_document_count} other` : "None"}
                </td>
                <td className="text-right">
                  <Link href={`/contracts/${row.id}#documents`} className="btn btn-primary btn-xs">
                    Upload signed agreement
                  </Link>
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}
    </section>
  );
}
