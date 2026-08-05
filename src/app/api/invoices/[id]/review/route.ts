import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { deriveInvoiceStatus, invoiceTotalsMismatchReason, todayDateString } from "@/lib/billing";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  if (!["manager", "billing"].includes(profile.role)) {
    return NextResponse.json({ error: "Only billing and manager roles can review invoices." }, { status: 403 });
  }

  let notes: string | null = null;
  try {
    const body = await request.json();
    notes = typeof body?.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
  } catch {
    notes = null;
  }

  const { id } = await params;
  const supabase = await createClient();
  const [{ data: invoice, error }, { data: lineItems, error: lineError }] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "id, status, due_date, amount_paid, remaining_balance, dispute_status, subtotal, tax_amount, credits, total_amount, reviewed_at"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("invoice_line_items").select("line_amount").eq("invoice_id", id),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (lineError) return NextResponse.json({ error: lineError.message }, { status: 500 });
  if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  if (invoice.status === "canceled") {
    return NextResponse.json({ error: "Canceled invoices cannot be reviewed." }, { status: 400 });
  }
  if (invoice.status !== "draft" && invoice.reviewed_at) {
    return NextResponse.json({ error: "This invoice has already been reviewed." }, { status: 400 });
  }
  if (invoice.status !== "draft") {
    return NextResponse.json({ error: "Only draft invoices can be reviewed and issued." }, { status: 400 });
  }

  const totalsMismatch = invoiceTotalsMismatchReason(invoice, lineItems ?? []);
  if (totalsMismatch) return NextResponse.json({ error: totalsMismatch }, { status: 400 });

  const nextStatus = deriveInvoiceStatus({
    currentStatus: "issued",
    dueDate: invoice.due_date,
    amountPaid: Number(invoice.amount_paid ?? 0),
    remainingBalance: Number(invoice.remaining_balance ?? 0),
    disputed: Boolean(invoice.dispute_status),
    today: todayDateString(),
  });

  const { error: updateError } = await supabase
    .from("invoices")
    .update({
      status: nextStatus,
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
      review_notes: notes,
    })
    .eq("id", id)
    .eq("status", "draft");

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ ok: true, status: nextStatus });
}
