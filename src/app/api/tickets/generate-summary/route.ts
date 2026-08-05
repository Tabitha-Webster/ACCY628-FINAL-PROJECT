import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import {
  buildFallbackCustomerSummary,
  collectSummarySourceText,
  generateWithOpenAI,
  hasEnoughNotesForSummary,
} from "@/lib/ticketSummary";

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }
  if (profile.role !== "technician") {
    return NextResponse.json(
      { error: "Only the assigned technician can generate a customer summary draft." },
      { status: 403 }
    );
  }

  let body: { ticketId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const ticketId = body.ticketId?.trim();
  if (!ticketId) {
    return NextResponse.json({ error: "Ticket id is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: ticket, error: ticketError } = await supabase
    .from("support_tickets")
    .select(
      "id, title, description, service_category, status, technician_notes, completion_notes, assigned_technician_id, customer_resolution_summary"
    )
    .eq("id", ticketId)
    .maybeSingle();

  if (ticketError) {
    return NextResponse.json({ error: ticketError.message }, { status: 500 });
  }
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  }
  if (ticket.assigned_technician_id !== profile.id) {
    return NextResponse.json(
      { error: "You can only generate a summary for tickets assigned to you." },
      { status: 403 }
    );
  }

  const { data: timeRows } = await supabase
    .from("time_entries")
    .select("description")
    .eq("support_ticket_id", ticketId)
    .limit(20);

  const workDescriptions = (timeRows ?? [])
    .map((row) => row.description)
    .filter((v): v is string => Boolean(v?.trim()));

  const input = {
    title: ticket.title,
    description: ticket.description,
    service_category: ticket.service_category,
    status: ticket.status,
    technician_notes: ticket.technician_notes,
    completion_notes: ticket.completion_notes,
    work_descriptions: workDescriptions,
  };

  if (!hasEnoughNotesForSummary(input)) {
    return NextResponse.json(
      {
        error:
          "Add technician work notes, completion notes, or time-entry descriptions before generating a summary.",
      },
      { status: 400 }
    );
  }

  const sourceText = collectSummarySourceText(input);
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_SUMMARY_MODEL?.trim() || "gpt-4o-mini";

  let summary: string;
  let source: "ai" | "fallback" = "fallback";
  let usedModel: string | null = null;
  let notice: string | null = null;

  if (apiKey) {
    try {
      const result = await generateWithOpenAI({ apiKey, model, sourceText });
      summary = result.summary;
      source = "ai";
      usedModel = result.model;
    } catch (err) {
      const message = err instanceof Error ? err.message : "AI provider failed.";
      // Soft-fallback so completion workflow is not blocked by AI outages.
      summary = buildFallbackCustomerSummary(input);
      source = "fallback";
      usedModel = null;
      notice = `AI generation failed (${message}). A basic draft was built from your notes instead — review carefully.`;
    }
  } else {
    summary = buildFallbackCustomerSummary(input);
    source = "fallback";
    notice =
      "No OPENAI_API_KEY is configured. This draft is a basic non-AI summary from your notes — review and edit before saving.";
  }

  if (!summary.trim()) {
    return NextResponse.json(
      { error: "Could not generate a summary. Please write one manually." },
      { status: 502 }
    );
  }

  // Audit draft generation only — does not save customer_resolution_summary.
  let auditErrorMessage: string | null = null;
  {
    const { error: auditError } = await supabase
      .from("support_tickets")
      .update({
        summary_generated_at: new Date().toISOString(),
        summary_generated_by: profile.id,
        summary_source: source,
        summary_model: usedModel,
      })
      .eq("id", ticketId)
      .eq("assigned_technician_id", profile.id);

    if (auditError?.message?.includes("summary_generated_at")) {
      auditErrorMessage =
        "Draft ready. Summary audit columns are not available yet — apply the AI/schedule migration when possible.";
    } else if (auditError) {
      auditErrorMessage = `Draft ready, but audit fields could not be saved: ${auditError.message}`;
    }
  }

  if (auditErrorMessage) {
    notice = [notice, auditErrorMessage].filter(Boolean).join(" ");
  }

  return NextResponse.json({
    summary,
    source,
    model: usedModel,
    notice,
    existingSummary: ticket.customer_resolution_summary,
    draftOnly: true,
    message:
      "Draft generated. Review and edit the customer-visible summary, then save or complete the ticket. Nothing was saved automatically.",
  });
}
