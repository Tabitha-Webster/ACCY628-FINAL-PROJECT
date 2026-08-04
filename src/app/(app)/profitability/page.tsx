import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { DataTable, EmptyState, ErrorState, Money, PageHeader, Percent } from "@/components/ui";
import { grossMarginPct, grossProfit, marginBand } from "@/lib/calculations";
import { statusLabel } from "@/lib/format";

type Totals = { revenue: number; directCost: number; laborCost: number };

function emptyTotals(): Totals {
  return { revenue: 0, directCost: 0, laborCost: 0 };
}

function marginBadgeClass(band: "profitable" | "low_margin" | "unprofitable") {
  if (band === "unprofitable") return "badge-error";
  if (band === "low_margin") return "badge-warning";
  return "badge-success";
}

export default async function ProfitabilityPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "manager") redirect("/dashboard");

  const supabase = await createClient();

  const [
    { data: customers, error: customersError },
    { data: contracts, error: contractsError },
    { data: revenue, error: revenueError },
    { data: costs, error: costsError },
    { data: laborEntries, error: laborError },
  ] = await Promise.all([
    supabase.from("customers").select("id, name"),
    supabase.from("contracts").select("id, name, contract_number, customer_id"),
    supabase.from("revenue_records").select("customer_id, contract_id, amount").eq("recognition", "earned"),
    supabase.from("direct_costs").select("customer_id, contract_id, internal_cost"),
    supabase.from("time_entries").select("customer_id, contract_id, labor_cost"),
  ]);

  const error = customersError || contractsError || revenueError || costsError || laborError;

  const byCustomer = new Map<string, Totals>();
  const byContract = new Map<string, Totals>();

  function add(map: Map<string, Totals>, key: string | null | undefined, field: keyof Totals, value: number) {
    if (!key) return;
    const totals = map.get(key) ?? emptyTotals();
    totals[field] += value;
    map.set(key, totals);
  }

  for (const r of revenue ?? []) {
    add(byCustomer, r.customer_id, "revenue", Number(r.amount ?? 0));
    add(byContract, r.contract_id, "revenue", Number(r.amount ?? 0));
  }
  for (const c of costs ?? []) {
    add(byCustomer, c.customer_id, "directCost", Number(c.internal_cost ?? 0));
    add(byContract, c.contract_id, "directCost", Number(c.internal_cost ?? 0));
  }
  for (const t of laborEntries ?? []) {
    add(byCustomer, t.customer_id, "laborCost", Number(t.labor_cost ?? 0));
    add(byContract, t.contract_id, "laborCost", Number(t.labor_cost ?? 0));
  }

  const customerRows = (customers ?? [])
    .map((customer) => {
      const totals = byCustomer.get(customer.id) ?? emptyTotals();
      const totalCost = totals.directCost + totals.laborCost;
      const profit = grossProfit(totals.revenue, totalCost);
      const marginPct = grossMarginPct(totals.revenue, totalCost);
      return { ...customer, ...totals, totalCost, profit, marginPct };
    })
    .filter((row) => row.revenue !== 0 || row.totalCost !== 0)
    .sort((a, b) => b.revenue - a.revenue);

  const contractRows = (contracts ?? [])
    .map((contract) => {
      const totals = byContract.get(contract.id) ?? emptyTotals();
      const totalCost = totals.directCost + totals.laborCost;
      const profit = grossProfit(totals.revenue, totalCost);
      const marginPct = grossMarginPct(totals.revenue, totalCost);
      return { ...contract, ...totals, totalCost, profit, marginPct };
    })
    .filter((row) => row.revenue !== 0 || row.totalCost !== 0)
    .sort((a, b) => b.revenue - a.revenue);

  const customerNameById = new Map((customers ?? []).map((c) => [c.id, c.name]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profitability"
        description="Earned revenue against direct costs and technician labor, by customer and by contract."
      />

      {error ? <ErrorState message={error.message} /> : null}

      <div>
        <h2 className="mb-2 text-lg font-semibold">By Customer</h2>
        {customerRows.length > 0 ? (
          <DataTable headers={["Customer", "Earned Revenue", "Direct Costs", "Labor Cost", "Gross Profit", "Margin", "Band"]}>
            {customerRows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={`/customers/${row.id}`} className="link link-hover font-medium">
                    {row.name}
                  </Link>
                </td>
                <td>
                  <Money value={row.revenue} />
                </td>
                <td>
                  <Money value={row.directCost} />
                </td>
                <td>
                  <Money value={row.laborCost} />
                </td>
                <td className={row.profit < 0 ? "text-error font-medium" : "font-medium"}>
                  <Money value={row.profit} />
                </td>
                <td>
                  <Percent value={row.marginPct} />
                </td>
                <td>
                  <span className={`badge ${marginBadgeClass(marginBand(row.marginPct))}`}>
                    {statusLabel(marginBand(row.marginPct))}
                  </span>
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState title="No revenue or cost activity recorded yet" />
        )}
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">By Contract</h2>
        {contractRows.length > 0 ? (
          <DataTable headers={["Contract", "Customer", "Earned Revenue", "Direct Costs", "Labor Cost", "Gross Profit", "Margin", "Band"]}>
            {contractRows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={`/contracts/${row.id}`} className="link link-hover font-medium">
                    {row.name}
                  </Link>
                  <div className="text-xs opacity-60">{row.contract_number}</div>
                </td>
                <td>{customerNameById.get(row.customer_id) ?? "—"}</td>
                <td>
                  <Money value={row.revenue} />
                </td>
                <td>
                  <Money value={row.directCost} />
                </td>
                <td>
                  <Money value={row.laborCost} />
                </td>
                <td className={row.profit < 0 ? "text-error font-medium" : "font-medium"}>
                  <Money value={row.profit} />
                </td>
                <td>
                  <Percent value={row.marginPct} />
                </td>
                <td>
                  <span className={`badge ${marginBadgeClass(marginBand(row.marginPct))}`}>
                    {statusLabel(marginBand(row.marginPct))}
                  </span>
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState title="No revenue or cost activity recorded by contract yet" />
        )}
      </div>
    </div>
  );
}
