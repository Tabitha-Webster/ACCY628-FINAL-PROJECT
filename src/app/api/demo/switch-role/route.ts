import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { roleHomePath, type UserRole } from "@/lib/constants";
import { getDemoCredentialsForRole, isKnownDemoRole } from "@/lib/demo-accounts.server";
import { isDemoModeEnabled } from "@/lib/demo-mode";

export const runtime = "nodejs";

type Body = {
  role?: string;
};

/**
 * Demo Mode only: sign in as a known demo account and return a session.
 * Passwords stay on the server — never sent to or from the client.
 */
export async function POST(request: Request) {
  if (!isDemoModeEnabled()) {
    return NextResponse.json(
      { error: "Demo Mode is disabled. Use normal email and password sign-in." },
      { status: 403 }
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const role = typeof body.role === "string" ? body.role.trim() : "";
  if (!role || !isKnownDemoRole(role)) {
    return NextResponse.json({ error: "Unknown demo role." }, { status: 400 });
  }

  const account = getDemoCredentialsForRole(role as UserRole);
  if (!account) {
    return NextResponse.json({ error: "Demo account is not configured." }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const supabase = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });

  if (error || !data.session) {
    const msg = (error?.message || "").trim();
    return NextResponse.json(
      {
        error:
          !msg || msg === "Invalid login credentials"
            ? "Demo account could not be loaded. Check that the account exists in Supabase."
            : msg,
      },
      { status: 401 }
    );
  }

  return NextResponse.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    role: account.role,
    homePath: roleHomePath(account.role),
  });
}
