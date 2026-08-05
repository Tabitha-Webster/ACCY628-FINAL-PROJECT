import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { deriveInvoiceStatus, invoiceTotalsMismatchReason, todayDateString } from "@/lib/billing";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  if (!["manager", "billing"].includes(profile.role)) {
    return NextResponse.json({ error: "Only billing and manager roles can mark invoices sent." }, { status: 403 });
  }

  const { id } = await params;
  const supabase = await createClient();
  const [{ data: invoice, error }, { data: lineItems, error: lineError }] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "id, status, due_date, amount_paid, remaining_balance, dispute_status, sent_at, reviewed_at, subtotal, tax_amount, credits, total_amount"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("invoice_line_items").select("line_amount").eq("invoice_id", id),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (lineError) return NextResponse.json({ error: lineError.message }, { status: 500 });
  if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  if (["canceled", "draft"].includes(invoice.status) || !invoice.reviewed_at) {
    return NextResponse.json(
      { error: "Draft invoices must be reviewed before they can be marked sent." },
      { status: 400 }
    );
  }

  const totalsMismatch = invoiceTotalsMismatchReason(invoice, lineItems ?? []);
  if (totalsMismatch) return NextResponse.json({ error: totalsMismatch }, { status: 400 });

  const nextStatus = deriveInvoiceStatus({
    currentStatus: invoice.status === "issued" ? "sent" : invoice.status,
    dueDate: invoice.due_date,
    amountPaid: Number(invoice.amount_paid ?? 0),
    remainingBalance: Number(invoice.remaining_balance ?? 0),
    disputed: Boolean(invoice.dispute_status) || invoice.status === "disputed",
    today: todayDateString(),
  });

  const { error: updateError } = await supabase
    .from("invoices")
    .update({
      status: nextStatus,
      sent_at: invoice.sent_at ?? new Date().toISOString(),
      sent_by: profile.id,
    })
    .eq("id", id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ ok: true, status: nextStatus });
}
