import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, requireApprovedCustomer } from "@/lib/auth";
import { PageHeader, DataTable, EmptyState, StatusBadge, Money, DateText, ErrorState } from "@/components/ui";
import type { Project } from "@/lib/types";

export default async function MyProjectsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "customer" || !profile.customer_id) redirect("/projects");
  await requireApprovedCustomer(profile);

  const supabase = await createClient();
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, name, status, start_date, target_completion_date, fixed_fee, estimated_billing_amount, amount_billed, amount_collected, description")
    .eq("customer_id", profile.customer_id)
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
    "id" | "name" | "status" | "start_date" | "target_completion_date" | "fixed_fee" | "estimated_billing_amount" | "amount_billed" | "amount_collected" | "description"
  >[];

  return (
    <div>
      <PageHeader title="Projects" description="Track the projects we're delivering for your organization." />

      {rows.length === 0 ? (
        <EmptyState title="No projects yet" description="Any projects scoped for your organization will appear here." />
      ) : (
        <DataTable headers={["Project", "Status", "Target Completion", "Amount", "Billed", "Collected"]}>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>
                <Link className="link link-hover font-medium" href={`/projects/${p.id}`}>
                  {p.name}
                </Link>
                {p.description ? <p className="mt-1 max-w-sm truncate text-xs opacity-60">{p.description}</p> : null}
              </td>
              <td>
                <StatusBadge status={p.status} />
              </td>
              <td>{p.target_completion_date ? <DateText value={p.target_completion_date} /> : "—"}</td>
              <td>
                <Money value={Number(p.fixed_fee ?? 0) || Number(p.estimated_billing_amount ?? 0)} />
              </td>
              <td>
                <Money value={Number(p.amount_billed ?? 0)} />
              </td>
              <td>
                <Money value={Number(p.amount_collected ?? 0)} />
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
