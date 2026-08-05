import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";
import { PageHeader, StatCard, ErrorState } from "@/components/ui";
import { AdminApprovalsInbox } from "@/components/AdminApprovalsInbox";
import { CsvExportButton } from "@/components/CsvExportButton";

export default async function AdminApprovalsPage() {
  const profile = await requireAdmin();
  const supabase = await createClient();

  const [workRes, timeRes, costsRes] = await Promise.all([
    supabase
      .from("additional_work_requests")
      .select(
        "id, title, estimated_hours, estimated_amount, created_at, support_ticket_id, customers(name)"
      )
      .eq("approval_status", "pending")
      .order("created_at", { ascending: true }),
    supabase
      .from("time_entries")
      .select("id, hours_worked, work_date, description, technician_id, customers(name)")
      .eq("approval_status", "pending")
      .order("work_date", { ascending: false }),
    supabase
      .from("direct_costs")
      .select(
        "id, cost_category, internal_cost, billable_amount, cost_date, description, customers(name)"
      )
      .eq("approval_status", "pending")
      .order("cost_date", { ascending: false }),
  ]);

  const error = workRes.error || timeRes.error || costsRes.error;
  if (error) {
    return (
      <div>
        <PageHeader title="Approvals Inbox" />
        <ErrorState message={error.message} />
      </div>
    );
  }

  const techIds = Array.from(
    new Set((timeRes.data ?? []).map((e) => e.technician_id).filter(Boolean))
  );
  const techNamesRes = techIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", techIds)
    : { data: [] as { id: string; full_name: string }[] };
  const techName = new Map((techNamesRes.data ?? []).map((p) => [p.id, p.full_name]));

  const pendingWork = (workRes.data ?? []).map((w) => {
    const customer = Array.isArray(w.customers) ? w.customers[0] : w.customers;
    return {
      id: w.id,
      title: w.title,
      estimated_hours: w.estimated_hours,
      estimated_amount: w.estimated_amount,
      created_at: w.created_at,
      support_ticket_id: w.support_ticket_id,
      customerName: customer?.name ?? "—",
    };
  });

  const pendingTime = (timeRes.data ?? []).map((t) => {
    const customer = Array.isArray(t.customers) ? t.customers[0] : t.customers;
    return {
      id: t.id,
      hours_worked: Number(t.hours_worked),
      work_date: t.work_date,
      description: t.description,
      technicianName: techName.get(t.technician_id) ?? "—",
      customerName: customer?.name ?? "—",
    };
  });

  const pendingCosts = (costsRes.data ?? []).map((c) => {
    const customer = Array.isArray(c.customers) ? c.customers[0] : c.customers;
    return {
      id: c.id,
      cost_category: c.cost_category,
      internal_cost: Number(c.internal_cost),
      billable_amount: c.billable_amount != null ? Number(c.billable_amount) : null,
      cost_date: c.cost_date,
      description: c.description,
      customerName: customer?.name ?? "—",
    };
  });

  const csvRows = [
    ...pendingWork.map((w) => [
      "additional_work",
      w.id,
      w.customerName,
      w.title,
      w.estimated_hours ?? "",
      w.estimated_amount ?? "",
      w.created_at,
    ]),
    ...pendingTime.map((t) => [
      "time_entry",
      t.id,
      t.customerName,
      t.description,
      t.hours_worked,
      "",
      t.work_date,
    ]),
    ...pendingCosts.map((c) => [
      "direct_cost",
      c.id,
      c.customerName,
      c.description,
      "",
      c.billable_amount ?? c.internal_cost,
      c.cost_date,
    ]),
  ];

  return (
    <div>
      <PageHeader
        title="Approvals Inbox"
        description="Approve or reject pending additional work, time entries, and direct costs in one place."
        actions={
          <div className="flex flex-wrap gap-2">
            <CsvExportButton
              filename="pending-approvals"
              headers={["Type", "Id", "Customer", "Summary", "Hours", "Amount", "Date"]}
              rows={csvRows}
            />
            <Link href="/admin" className="btn btn-sm btn-outline">
              Back to Admin
            </Link>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Additional work" value={String(pendingWork.length)} tone={pendingWork.length ? "warning" : "success"} />
        <StatCard label="Time entries" value={String(pendingTime.length)} tone={pendingTime.length ? "warning" : "success"} />
        <StatCard label="Direct costs" value={String(pendingCosts.length)} tone={pendingCosts.length ? "warning" : "success"} />
      </div>

      <AdminApprovalsInbox
        reviewerId={profile.id}
        pendingWork={pendingWork}
        pendingTime={pendingTime}
        pendingCosts={pendingCosts}
      />
    </div>
  );
}
