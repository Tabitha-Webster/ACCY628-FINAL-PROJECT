import { NextResponse } from "next/server";
import type { UserRole } from "@/lib/constants";
import { getDemoCredentialsForRole, isKnownDemoRole } from "@/lib/demo-accounts.server";
import { isDemoModeEnabled } from "@/lib/demo-mode";

export const runtime = "nodejs";

type Body = {
  role?: string;
};

/**
 * Demo Mode only: return email + password for form autofill on the login page.
 * Does not create a session. Internal role switcher continues to use /api/demo/switch-role.
 */
export async function POST(request: Request) {
  if (!isDemoModeEnabled()) {
    return NextResponse.json(
      { error: "Demo Mode is disabled." },
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

  return NextResponse.json({
    email: account.email,
    password: account.password,
    role: account.role,
    label: account.label,
  });
}
