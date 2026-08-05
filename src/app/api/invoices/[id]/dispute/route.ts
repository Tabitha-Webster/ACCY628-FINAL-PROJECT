import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { deriveInvoiceStatus, round2, todayDateString } from "@/lib/billing";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  if (!["manager", "billing"].includes(profile.role)) {
    return NextResponse.json({ error: "Only billing and manager roles can update invoice disputes." }, { status: 403 });
  }

  const { id } = await params;
  let body: { action?: string; reason?: string; amount?: number; notes?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const supabase = await createClient();
  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("id, customer_id, status, due_date, amount_paid, remaining_balance, dispute_status, total_amount, sent_at")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  if (invoice.status === "canceled") {
    return NextResponse.json({ error: "Canceled invoices cannot be disputed." }, { status: 400 });
  }

  if (body.action === "resolve") {
    await supabase
      .from("disputes")
      .update({
        resolution_status: "resolved",
        resolution_notes: body.notes?.trim() || "Dispute resolved.",
      })
      .eq("invoice_id", id)
      .in("resolution_status", ["open", "under_review"]);

    const nextStatus = deriveInvoiceStatus({
      currentStatus: invoice.sent_at ? "sent" : "issued",
      dueDate: invoice.due_date,
      amountPaid: Number(invoice.amount_paid ?? 0),
      remainingBalance: Number(invoice.remaining_balance ?? 0),
      disputed: false,
      today: todayDateString(),
    });

    const { error: updateError } = await supabase
      .from("invoices")
      .update({ status: nextStatus, dispute_status: false })
      .eq("id", id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: nextStatus });
  }

  const reason = body.reason?.trim();
  if (!reason) {
    return NextResponse.json({ error: "Enter a dispute reason." }, { status: 400 });
  }

  const remaining = Number(invoice.remaining_balance ?? invoice.total_amount ?? 0);
  const amount = round2(Number(body.amount ?? remaining));
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Enter a valid disputed amount." }, { status: 400 });
  }

  const { error: disputeError } = await supabase.from("disputes").insert({
    invoice_id: id,
    customer_id: invoice.customer_id,
    dispute_date: todayDateString(),
    dispute_reason: reason,
    disputed_amount: amount,
    assigned_owner_id: profile.id,
    resolution_status: "open",
  });
  if (disputeError) return NextResponse.json({ error: disputeError.message }, { status: 500 });

  const { error: updateError } = await supabase
    .from("invoices")
    .update({ status: "disputed", dispute_status: true })
    .eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true, status: "disputed" });
}
