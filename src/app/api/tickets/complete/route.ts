import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { validateTicketCompletion } from "@/lib/technicianWork";

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }
  if (profile.role !== "technician") {
    return NextResponse.json(
      { error: "Only the assigned technician can mark a ticket complete." },
      { status: 403 }
    );
  }

  let body: {
    ticketId?: string;
    completionNotes?: string;
    customerResolutionSummary?: string;
    workDescription?: string;
    noTimeExplanation?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const ticketId = body.ticketId;
  if (!ticketId) {
    return NextResponse.json({ error: "Ticket id is required." }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: ticket, error: ticketError } = await supabase
    .from("support_tickets")
    .select(
      "id, assigned_technician_id, status, technician_notes, classification, billable_approval_status"
    )
    .eq("id", ticketId)
    .maybeSingle();

  if (ticketError) {
    return NextResponse.json({ error: ticketError.message }, { status: 500 });
  }
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  }

  const { data: timeRows } = await supabase
    .from("time_entries")
    .select("hours_worked, description")
    .eq("support_ticket_id", ticketId);

  const recordedHours = (timeRows ?? []).reduce((sum, row) => sum + Number(row.hours_worked ?? 0), 0);
  const hasTimeEntryDescriptions = (timeRows ?? []).some((row) => Boolean(row.description?.trim()));

  const completionNotes = body.completionNotes ?? "";
  const customerResolutionSummary = body.customerResolutionSummary ?? "";
  const workDescription = body.workDescription ?? "";
  const noTimeExplanation = body.noTimeExplanation ?? "";

  const errors = validateTicketCompletion({
    isAssignedTechnician: ticket.assigned_technician_id === profile.id,
    completionNotes,
    customerResolutionSummary,
    workDescription,
    existingTechnicianNotes: ticket.technician_notes,
    hasTimeEntryDescriptions,
    recordedHours,
    noTimeExplanation,
  });

  if (errors.length > 0) {
    return NextResponse.json({ error: errors[0], errors }, { status: 400 });
  }

  if (
    ticket.classification === "billable" &&
    ticket.billable_approval_status &&
    !["approved", "not_required"].includes(ticket.billable_approval_status)
  ) {
    return NextResponse.json(
      {
        error:
          "Billable work on this ticket still needs approval before it can be treated as ready to bill.",
      },
      { status: 400 }
    );
  }

  const { data, error } = await supabase.rpc("complete_support_ticket", {
    p_ticket_id: ticketId,
    p_completion_notes: completionNotes.trim(),
    p_customer_resolution_summary: customerResolutionSummary.trim(),
    p_work_description: workDescription.trim() || null,
    p_no_time_explanation: recordedHours <= 0 ? noTimeExplanation.trim() : null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    message: "Ticket marked complete. Status set to Resolved.",
    ticket: data,
  });
}
