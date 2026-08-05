import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { ButtonLink } from "@/components/Button";
import { Card } from "@/components/Card";
import { PageLayout } from "@/components/PageLayout";
import { ErrorState } from "@/components/ui";
import { statusBadgeClass, statusLabel } from "@/lib/format";

type CustomerDetail = {
  id: string;
  name: string | null;
  status: string | null;
  industry: string | null;
  primary_contact: string | null;
  contact_email: string | null;
  primary_contact_phone: string | null;
  customer_identifier: string | null;
  billing_contact_name: string | null;
  billing_contact_email: string | null;
  billing_address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  notes: string | null;
};

const DETAIL_SELECT =
  "id, name, status, industry, primary_contact, contact_email, primary_contact_phone, customer_identifier, billing_contact_name, billing_contact_email, billing_address, city, state, postal_code, notes";

const CORE_SELECT = "id, name, status, industry, primary_contact, contact_email, notes";

function display(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "—";
}

function customerStatusBadgeClass(status: string) {
  const s = status.toLowerCase();
  if (s === "active") return "badge-success";
  if (s === "inactive") return "badge-error";
  if (s === "on_hold") return "badge-warning";
  return statusBadgeClass(s);
}

function CustomerStatusBadge({ status }: { status: string }) {
  return <span className={`badge ${customerStatusBadgeClass(status)}`}>{statusLabel(status)}</span>;
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide opacity-60">{label}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

function noteValue(notes: string | null | undefined, label: string) {
  if (!notes) return null;
  const line = notes
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry.toLowerCase().startsWith(`${label.toLowerCase()}:`));
  if (!line) return null;
  return line.slice(label.length + 1).trim() || null;
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!["manager", "billing", "technician"].includes(profile.role)) redirect("/dashboard");

  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId ?? "").trim();

  if (!id) {
    return (
      <PageLayout
        title="Customer not found"
        description="Customer details"
        actions={
          <ButtonLink href="/customers" variant="secondary" size="sm">
            Back to list
          </ButtonLink>
        }
      >
        <ErrorState message="No customer ID was provided in the link. Return to the customer list and select a customer again." />
      </PageLayout>
    );
  }

  const supabase = await createClient();

  let { data: customer, error } = await supabase
    .from("customers")
    .select(DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error && /column|does not exist|customer_identifier|billing_|primary_contact_phone|city|state|postal/i.test(error.message)) {
    const fallback = await supabase.from("customers").select(CORE_SELECT).eq("id", id).maybeSingle();
    customer = fallback.data
      ? ({
          ...fallback.data,
          primary_contact_phone: null,
          customer_identifier: null,
          billing_contact_name: noteValue(fallback.data.notes, "Billing contact"),
          billing_contact_email: noteValue(fallback.data.notes, "Billing email"),
          billing_address: noteValue(fallback.data.notes, "Billing address"),
          city: noteValue(fallback.data.notes, "City"),
          state: noteValue(fallback.data.notes, "State"),
          postal_code: noteValue(fallback.data.notes, "Postal code"),
        } as CustomerDetail)
      : null;
    error = fallback.error;
  }

  if (error) {
    return (
      <PageLayout
        title="Customer"
        description="Customer details"
        actions={
          <ButtonLink href="/customers" variant="secondary" size="sm">
            Back to list
          </ButtonLink>
        }
      >
        <ErrorState message={`Unable to load this customer. ${error.message}`} />
      </PageLayout>
    );
  }

  if (!customer) {
    return (
      <PageLayout
        title="Customer not found"
        description="Customer details"
        actions={
          <ButtonLink href="/customers" variant="secondary" size="sm">
            Back to list
          </ButtonLink>
        }
      >
        <ErrorState message="That customer does not exist, or you do not have access to it. Return to the customer list and try another record." />
      </PageLayout>
    );
  }

  const row = customer as CustomerDetail;
  const identifier = display(row.customer_identifier) !== "—" ? row.customer_identifier : row.id;
  const canEdit = ["manager", "billing"].includes(profile.role);

  return (
    <PageLayout
      title={display(row.name)}
      description="Customer profile"
      actions={
        <>
          <ButtonLink href="/customers" variant="secondary" size="sm">
            Back to list
          </ButtonLink>
          {canEdit ? (
            <ButtonLink href={`/customers/${row.id}/edit`} variant="primary" size="sm">
              Edit Customer
            </ButtonLink>
          ) : null}
        </>
      }
    >
      <Card title="Customer details">
        <dl className="grid gap-4 sm:grid-cols-2">
          <DetailField label="Customer identifier">
            <span className="font-mono text-xs tabular-nums">{display(identifier)}</span>
          </DetailField>
          <DetailField label="Customer name">{display(row.name)}</DetailField>
          <DetailField label="Customer status">
            {row.status ? <CustomerStatusBadge status={row.status} /> : "—"}
          </DetailField>
          <DetailField label="Industry">{display(row.industry)}</DetailField>
        </dl>
      </Card>

      <Card title="Primary contact">
        <dl className="grid gap-4 sm:grid-cols-2">
          <DetailField label="Primary contact name">{display(row.primary_contact)}</DetailField>
          <DetailField label="Primary contact email">{display(row.contact_email)}</DetailField>
          <DetailField label="Primary contact phone">{display(row.primary_contact_phone)}</DetailField>
        </dl>
      </Card>

      <Card title="Billing information">
        <dl className="grid gap-4 sm:grid-cols-2">
          <DetailField label="Billing contact name">{display(row.billing_contact_name)}</DetailField>
          <DetailField label="Billing contact email">{display(row.billing_contact_email)}</DetailField>
          <DetailField label="Billing address">{display(row.billing_address)}</DetailField>
          <DetailField label="City">{display(row.city)}</DetailField>
          <DetailField label="State">{display(row.state)}</DetailField>
          <DetailField label="Postal code">{display(row.postal_code)}</DetailField>
        </dl>
      </Card>
    </PageLayout>
  );
}
