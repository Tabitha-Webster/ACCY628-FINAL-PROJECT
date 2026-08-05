import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }
  if (!["manager", "billing"].includes(profile.role)) {
    return NextResponse.json(
      { error: "Only managers or billing can approve work for billing. Technicians cannot approve or invoice." },
      { status: 403 }
    );
  }

  let body: { type?: "time_entry" | "direct_cost"; id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.id || (body.type !== "time_entry" && body.type !== "direct_cost")) {
    return NextResponse.json({ error: "Provide a time_entry or direct_cost id." }, { status: 400 });
  }

  const supabase = await createClient();
  const rpc =
    body.type === "time_entry" ? "approve_time_entry_for_billing" : "approve_direct_cost_for_billing";
  const arg = body.type === "time_entry" ? { p_entry_id: body.id } : { p_cost_id: body.id };

  const { data, error } = await supabase.rpc(rpc, arg);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    message:
      "Work approved for billing. It will appear in Ready to Bill when ticket eligibility rules are met (completed ticket, notes, rate, valid contract).",
    row: data,
  });
}
