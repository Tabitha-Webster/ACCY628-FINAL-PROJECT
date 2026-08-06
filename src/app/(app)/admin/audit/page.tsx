import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";
import { PageHeader, StatCard, EmptyState, ErrorState, DateText } from "@/components/ui";

type AuditEvent = {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  entity_type: string;
  entity_id: string;
  changed_fields: string[];
  old_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
  created_at: string;
};

const FIELD_LABELS: Record<string, string> = {
  email: "Email",
  full_name: "Name",
  role: "Role",
  is_active: "Access status",
  customer_id: "Customer link",
  page_key: "Page",
  can_view: "Can view",
  name: "Name",
  status: "Status",
  contact_email: "Contact email",
  primary_contact: "Primary contact",
  billing_email: "Billing email",
  billing_frequency: "Billing frequency",
  payment_terms: "Payment terms",
  monthly_recurring_fee: "Monthly recurring fee",
  billing_status: "Billing status",
  contract_id: "Contract link",
  due_date: "Due date",
  subtotal: "Subtotal",
  tax_amount: "Tax amount",
  credits: "Credits",
  total_amount: "Total amount",
  amount_paid: "Amount paid",
  remaining_balance: "Remaining balance",
  payment_date: "Payment date",
  payment_amount: "Payment amount",
  payment_method: "Payment method",
  reference_number: "Reference number",
  company: "Company settings",
  tax: "Tax defaults",
  numbering: "Numbering",
  integrations: "Integrations",
  demo: "Demo toggles",
};

const ENTITY_LABELS: Record<string, string> = {
  profiles: "User access",
  role_page_permissions: "Role permission",
  customers: "Customer",
  contracts: "Contract",
  invoices: "Invoice",
  payments: "Payment",
  system_configuration: "Configuration",
};

function displayValue(value: unknown) {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function actionLabel(action: AuditEvent["action"]) {
  if (action === "INSERT") return "Created";
  if (action === "DELETE") return "Deleted";
  return "Updated";
}

function actionBadge(action: AuditEvent["action"]) {
  if (action === "INSERT") return "badge-success";
  if (action === "DELETE") return "badge-error";
  return "badge-warning";
}

export default async function AdminAuditPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("system_audit_events")
    .select(
      "id, actor_id, actor_email, action, entity_type, entity_id, changed_fields, old_values, new_values, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(250);

  if (error) {
    return (
      <div>
        <PageHeader
          title="Audit Trail"
          description="Change-only history for sensitive system records."
          actions={
            <Link href="/admin" className="btn btn-sm btn-outline">
              Back to Home
            </Link>
          }
        />
        <ErrorState message={error.message} />
      </div>
    );
  }

  const events = (data ?? []) as AuditEvent[];
  const actorIds = Array.from(
    new Set(events.map((event) => event.actor_id).filter((id): id is string => Boolean(id)))
  );
  const actorsRes = actorIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", actorIds)
    : { data: [] as { id: string; full_name: string; email: string }[] };
  const actors = new Map(
    (actorsRes.data ?? []).map((actor) => [
      actor.id,
      { name: actor.full_name, email: actor.email },
    ])
  );

  const created = events.filter((event) => event.action === "INSERT").length;
  const updated = events.filter((event) => event.action === "UPDATE").length;
  const deleted = events.filter((event) => event.action === "DELETE").length;

  return (
    <div>
      <PageHeader
        title="Audit Trail"
        description="Who changed sensitive system data, what changed, which record was affected, and when."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/exports" className="btn btn-sm btn-outline">
              Data Exports
            </Link>
            <Link href="/admin" className="btn btn-sm btn-outline">
              Back to Home
            </Link>
          </div>
        }
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-4">
        <StatCard label="Recent actions" value={String(events.length)} />
        <StatCard label="Created" value={String(created)} tone="success" />
        <StatCard label="Updated" value={String(updated)} tone="warning" />
        <StatCard label="Deleted" value={String(deleted)} tone={deleted ? "error" : "success"} />
      </div>

      {events.length === 0 ? (
        <EmptyState
          title="No audited changes yet"
          description="Events appear after a user creates, updates, or deletes a monitored sensitive record."
        />
      ) : (
        <div className="space-y-2">
          {events.map((event) => {
            const actor = event.actor_id ? actors.get(event.actor_id) : null;
            const actorName = actor?.name || event.actor_email || "System / service process";
            const actorDetail = actor?.email || event.actor_id || "No signed-in user ID";
            const entityLabel = ENTITY_LABELS[event.entity_type] ?? event.entity_type;
            const fieldSummary = event.changed_fields
              .map((field) => FIELD_LABELS[field] ?? field)
              .join(", ");
            return (
              <details
                key={event.id}
                className="group rounded-box border border-base-300 bg-base-100 open:border-primary/40"
              >
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-2.5 text-sm hover:bg-base-200/50">
                  <ChevronRight className="h-4 w-4 shrink-0 opacity-50 transition-transform group-open:rotate-90" aria-hidden />
                  <span className={`badge badge-sm ${actionBadge(event.action)}`}>
                    {actionLabel(event.action)}
                  </span>
                  <span className="font-semibold">{actorName}</span>
                  <span className="opacity-70">
                    changed {entityLabel}
                    {fieldSummary ? ` · ${fieldSummary}` : ""}
                  </span>
                  <span className="ml-auto shrink-0 text-xs opacity-60">
                    <DateText value={event.created_at} />
                  </span>
                </summary>

                <div className="border-t border-base-300 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs opacity-70">
                    <span className="badge badge-ghost badge-sm">{entityLabel}</span>
                    <span>{actorDetail}</span>
                    <span className="break-all">Record: {event.entity_id}</span>
                  </div>

                  <div className="mt-3 overflow-x-auto">
                    <table className="table table-sm">
                      <thead>
                        <tr>
                          <th>Sensitive field</th>
                          <th>Old value</th>
                          <th>New value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {event.changed_fields.map((field) => (
                          <tr key={field}>
                            <td className="font-medium">{FIELD_LABELS[field] ?? field}</td>
                            <td className="max-w-xs break-all font-mono text-xs">
                              {displayValue(event.old_values?.[field])}
                            </td>
                            <td className="max-w-xs break-all font-mono text-xs">
                              {displayValue(event.new_values?.[field])}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}

      <div className="mt-6 rounded-box border border-base-300 bg-base-100 p-4 text-sm opacity-80">
        This trail records create, update, and delete actions on monitored sensitive fields. Opening or
        viewing a page is not recorded.
      </div>
    </div>
  );
}
