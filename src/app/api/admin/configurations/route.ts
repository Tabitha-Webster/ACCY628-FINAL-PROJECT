import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/constants";
import { mergeSystemConfiguration, type SystemConfiguration } from "@/lib/system-configuration";
import { loadSystemConfiguration, saveSystemConfiguration } from "@/lib/system-configuration-data";
import { rewriteDocumentPrefixes } from "@/lib/document-numbering";

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

  const { config: previous } = await loadSystemConfiguration();
  const config = mergeSystemConfiguration(body);
  const { error } = await saveSystemConfiguration(config, profile.id);
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  const { rewritten, errors: rewriteErrors } = await rewriteDocumentPrefixes(
    previous.numbering,
    config.numbering
  );

  const rewrittenTotal = Object.values(rewritten).reduce((sum, n) => sum + (n ?? 0), 0);
  const warning =
    rewriteErrors.length > 0
      ? `Prefix saved, but some document numbers could not be updated: ${rewriteErrors.slice(0, 3).join("; ")}`
      : null;

  return NextResponse.json({
    ok: true,
    config,
    rewritten,
    rewrittenTotal,
    warning,
  });
}
