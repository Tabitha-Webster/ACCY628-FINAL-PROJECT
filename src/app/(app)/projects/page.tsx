import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { PageHeader, DataTable, EmptyState, StatusBadge, Money, ErrorState } from "@/components/ui";
import { grossMarginPct, marginBand } from "@/lib/calculations";
import type { Project } from "@/lib/types";

export default async function ProjectsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role === "customer") redirect("/my-projects");

  const supabase = await createClient();
  const { data: projects, error } = await supabase
    .from("projects")
    .select(
      "id, customer_id, name, status, fixed_fee, estimated_billing_amount, labor_budget, equipment_budget, software_budget, vendor_budget, amount_billed, amount_collected, target_completion_date"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div>
        <PageHeader title="Projects" />
        <ErrorState message={error.message} />
      </div>
    );
  }

  const rows = (projects ?? []) as Pick<
    Project,
    | "id"
    | "customer_id"
    | "name"
    | "status"
    | "fixed_fee"
    | "estimated_billing_amount"
    | "labor_budget"
    | "equipment_budget"
    | "software_budget"
    | "vendor_budget"
    | "amount_billed"
    | "amount_collected"
    | "target_completion_date"
  >[];

  const customerIds = Array.from(new Set(rows.map((p) => p.customer_id)));
  const projectIds = rows.map((p) => p.id);

  const [customersRes, timeRes, costsRes] = await Promise.all([
    customerIds.length ? supabase.from("customers").select("id, name").in("id", customerIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    projectIds.length ? supabase.from("time_entries").select("project_id, labor_cost").in("project_id", projectIds) : Promise.resolve({ data: [] as { project_id: string | null; labor_cost: number | null }[] }),
    projectIds.length ? supabase.from("direct_costs").select("project_id, internal_cost").in("project_id", projectIds) : Promise.resolve({ data: [] as { project_id: string | null; internal_cost: number }[] }),
  ]);
  const customerName = new Map((customersRes.data ?? []).map((c) => [c.id, c.name]));

  const actualByProject = new Map<string, number>();
  for (const t of timeRes.data ?? []) {
    if (!t.project_id) continue;
    actualByProject.set(t.project_id, (actualByProject.get(t.project_id) ?? 0) + Number(t.labor_cost ?? 0));
  }
  for (const c of costsRes.data ?? []) {
    if (!c.project_id) continue;
    actualByProject.set(c.project_id, (actualByProject.get(c.project_id) ?? 0) + Number(c.internal_cost));
  }

  const isInternal = profile.role === "manager" || profile.role === "billing";

  return (
    <div>
      <PageHeader title="Projects" description={`${rows.length} project${rows.length === 1 ? "" : "s"} visible to your role.`} />

      {rows.length === 0 ? (
        <EmptyState title="No projects yet" description="Projects created for customers will appear here." />
      ) : (
        <DataTable
          headers={
            isInternal
              ? ["Project", "Customer", "Status", "Budget", "Actual", "Margin", "Target Completion"]
              : ["Project", "Customer", "Status", "Target Completion"]
          }
        >
          {rows.map((p) => {
            const budget =
              Number(p.labor_budget ?? 0) + Number(p.equipment_budget ?? 0) + Number(p.software_budget ?? 0) + Number(p.vendor_budget ?? 0);
            const actual = actualByProject.get(p.id) ?? 0;
            const revenue = Number(p.fixed_fee ?? 0) || Number(p.estimated_billing_amount ?? 0);
            const margin = grossMarginPct(revenue, actual);
            return (
              <tr key={p.id}>
                <td>
                  <Link className="link link-hover font-medium" href={`/projects/${p.id}`}>
                    {p.name}
                  </Link>
                </td>
                <td>{customerName.get(p.customer_id) ?? "—"}</td>
                <td>
                  <StatusBadge status={p.status} />
                </td>
                {isInternal ? (
                  <>
                    <td>
                      <Money value={budget} />
                    </td>
                    <td>
                      <Money value={actual} />
                    </td>
                    <td>
                      <StatusBadge status={marginBand(margin)} />
                    </td>
                  </>
                ) : null}
                <td>{p.target_completion_date ?? "—"}</td>
              </tr>
            );
          })}
        </DataTable>
      )}
    </div>
  );
}
