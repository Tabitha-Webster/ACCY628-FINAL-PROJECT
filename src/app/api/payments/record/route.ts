import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { deriveInvoiceStatus, round2 } from "@/lib/billing";

const VALID_METHODS = ["ach", "check", "credit_card", "wire", "other"];
const CUSTOMER_METHODS = ["ach", "credit_card"];

function toCents(value: number): number {
  return Math.round(value * 100);
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function generatePaymentNumber(): string {
  const today = new Date();
  const stamp = today.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `PMT-${stamp}-${suffix}`;
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }
  if (!["manager", "billing", "customer"].includes(profile.role)) {
    return NextResponse.json({ error: "Your role cannot submit payments." }, { status: 403 });
  }
  if (profile.role === "customer" && !profile.customer_id) {
    return NextResponse.json({ error: "Your account is not linked to a customer." }, { status: 403 });
  }

  let body: {
    invoiceId?: string;
    amount?: number;
    paymentDate?: string;
    paymentMethod?: string;
    referenceNumber?: string;
    notes?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const invoiceId = body.invoiceId;
  const amountCents = toCents(Number(body.amount));
  const amount = amountCents / 100;

  if (!invoiceId || !Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json({ error: "Enter a valid invoice and a payment amount greater than zero." }, { status: 400 });
  }

  const allowedMethods = profile.role === "customer" ? CUSTOMER_METHODS : VALID_METHODS;
  if (body.paymentMethod && !allowedMethods.includes(body.paymentMethod)) {
    return NextResponse.json({ error: "Select a valid payment method." }, { status: 400 });
  }
  const paymentMethod = body.paymentMethod || "ach";
  const today = new Date().toISOString().slice(0, 10);
  const paymentDate = profile.role === "customer" ? today : body.paymentDate || today;
  if (!isValidDate(paymentDate)) {
    return NextResponse.json({ error: "Enter a valid payment date." }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, customer_id, status, remaining_balance, amount_paid, due_date, total_amount, dispute_status")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invoiceError) {
    return NextResponse.json({ error: invoiceError.message }, { status: 500 });
  }
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }
  if (profile.role === "customer" && invoice.customer_id !== profile.customer_id) {
    return NextResponse.json({ error: "You can only pay invoices for your own account." }, { status: 403 });
  }
  if (["draft", "canceled"].includes(invoice.status)) {
    return NextResponse.json({ error: "Only issued invoices can receive payments." }, { status: 400 });
  }
  if (invoice.status === "disputed" || invoice.dispute_status) {
    return NextResponse.json(
      { error: "This invoice is disputed. Resolve the dispute before recording a payment." },
      { status: 400 }
    );
  }

  const remainingBalance = Number(invoice.remaining_balance ?? 0);
  const remainingCents = toCents(remainingBalance);
  if (remainingCents <= 0) {
    return NextResponse.json({ error: "This invoice is already paid in full." }, { status: 400 });
  }
  if (amountCents > remainingCents) {
    return NextResponse.json(
      { error: `Payment amount cannot exceed the remaining balance of $${remainingBalance.toFixed(2)}.` },
      { status: 400 }
    );
  }

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .insert({
      payment_number: generatePaymentNumber(),
      customer_id: invoice.customer_id,
      payment_date: paymentDate,
      payment_amount: amount,
      payment_method: paymentMethod,
      reference_number: profile.role === "customer" ? null : body.referenceNumber || null,
      notes: profile.role === "customer" ? "Submitted through the customer demo payment screen." : body.notes || null,
      recorded_by: profile.id,
    })
    .select()
    .single();

  if (paymentError || !payment) {
    return NextResponse.json({ error: paymentError?.message ?? "Failed to record payment." }, { status: 500 });
  }

  const { error: applicationError } = await supabase.from("payment_applications").insert({
    payment_id: payment.id,
    invoice_id: invoiceId,
    amount_applied: amount,
  });

  if (applicationError) {
    await supabase.from("payments").delete().eq("id", payment.id);
    return NextResponse.json({ error: applicationError.message }, { status: 500 });
  }

  const newAmountPaid = round2(Number(invoice.amount_paid ?? 0) + amount);
  const newRemainingBalance = round2(Math.max(0, remainingBalance - amount));
  const newStatus = deriveInvoiceStatus({
    currentStatus: invoice.status,
    dueDate: invoice.due_date,
    amountPaid: newAmountPaid,
    remainingBalance: newRemainingBalance,
    disputed: Boolean(invoice.dispute_status) || invoice.status === "disputed",
  });

  const { error: updateError } = await supabase
    .from("invoices")
    .update({
      amount_paid: newAmountPaid,
      remaining_balance: newRemainingBalance,
      status: newStatus,
    })
    .eq("id", invoiceId);

  if (updateError) {
    await supabase.from("payment_applications").delete().eq("payment_id", payment.id).eq("invoice_id", invoiceId);
    await supabase.from("payments").delete().eq("id", payment.id);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  [
    "/dashboard",
    "/payments",
    "/invoices",
    `/invoices/${invoiceId}`,
    "/accounts-receivable",
    "/billing-collections",
    "/my-invoices",
    "/make-payment",
  ].forEach((path) => revalidatePath(path));

  return NextResponse.json({
    payment: {
      id: payment.id,
      paymentNumber: payment.payment_number,
      amount: payment.payment_amount,
    },
    invoice: {
      id: invoiceId,
      remainingBalance: newRemainingBalance,
      status: newStatus,
    },
  });
}
