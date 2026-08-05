import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { ASSIGNABLE_ROLES, isAdminRole, type UserRole } from "@/lib/constants";

type Body = {
  email?: string;
  password?: string;
  fullName?: string;
  role?: string;
  customerId?: string | null;
  isDemoUser?: boolean;
  internalCostRate?: number | null;
};

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
    return NextResponse.json({ error: "Only Admin can create users." }, { status: 403 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  const fullName = body.fullName?.trim() ?? "";
  const role = body.role as UserRole;
  const customerId = body.customerId || null;
  const isDemoUser = Boolean(body.isDemoUser);
  const internalCostRate =
    body.internalCostRate == null || Number.isNaN(Number(body.internalCostRate))
      ? null
      : Number(body.internalCostRate);

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }
  if (!fullName) {
    return NextResponse.json({ error: "Enter the user's full name." }, { status: 400 });
  }
  if (!ASSIGNABLE_ROLES.includes(role)) {
    return NextResponse.json({ error: "Choose a valid role." }, { status: 400 });
  }
  if (role === "customer" && !customerId) {
    return NextResponse.json({ error: "Customer users need a linked customer." }, { status: 400 });
  }

  try {
    const admin = createServiceClient();
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role,
      },
    });

    if (createError || !created.user) {
      return NextResponse.json(
        { error: createError?.message ?? "Could not create Auth user." },
        { status: 400 }
      );
    }

    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: created.user.id,
        email,
        full_name: fullName,
        role,
        customer_id: role === "customer" ? customerId : null,
        internal_cost_rate: internalCostRate,
        is_demo_user: isDemoUser,
        is_active: true,
      },
      { onConflict: "id" }
    );

    if (profileError) {
      return NextResponse.json(
        {
          error: `Auth user created, but profile update failed: ${profileError.message}`,
          userId: created.user.id,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      user: {
        id: created.user.id,
        email,
        full_name: fullName,
        role,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error creating user.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
