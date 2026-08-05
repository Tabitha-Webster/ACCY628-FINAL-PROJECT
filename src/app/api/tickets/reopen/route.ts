import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }
  if (profile.role !== "manager") {
    return NextResponse.json(
      { error: "Only managers can deliberately reopen completed tickets." },
      { status: 403 }
    );
  }

  let body: { ticketId?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const ticketId = body.ticketId;
  const reason = (body.reason ?? "").trim();
  if (!ticketId) {
    return NextResponse.json({ error: "Ticket id is required." }, { status: 400 });
  }
  if (reason.length < 10) {
    return NextResponse.json(
      { error: "Provide a clear reopen reason (at least a short sentence)." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reopen_support_ticket", {
    p_ticket_id: ticketId,
    p_reason: reason,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    message: "Ticket reopened. The reason was recorded on the ticket history.",
    ticket: data,
  });
}
