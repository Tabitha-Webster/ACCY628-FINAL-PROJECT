import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/constants";
import { mergeSystemConfiguration, type SystemConfiguration } from "@/lib/system-configuration";
import { saveSystemConfiguration } from "@/lib/system-configuration-data";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !isAdminRole(profile.role)) {
    return NextResponse.json({ error: "Only Admin can change configurations." }, { status: 403 });
  }

  let body: Partial<SystemConfiguration>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const config = mergeSystemConfiguration(body);
  const { error } = await saveSystemConfiguration(config, profile.id);
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, config });
}
