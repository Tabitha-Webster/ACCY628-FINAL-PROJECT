import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { pathAllowedByPageKeys, defaultAllowedKeysForRole } from "@/lib/role-permissions";
import { roleHomePath, type UserRole } from "@/lib/constants";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthPage =
    path === "/login" ||
    path === "/signup" ||
    path === "/customer-signup" ||
    path.startsWith("/auth");
  // Login-page demo autofill must work while signed out.
  const isPublicDemoAutofill = path === "/api/demo/autofill";

  if (!user && !isAuthPage && !isPublicDemoAutofill && path !== "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (
    user &&
    (path === "/login" || path === "/signup" || path === "/customer-signup" || path === "/")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  if (
    user &&
    !isAuthPage &&
    path !== "/" &&
    !path.startsWith("/api") &&
    path !== "/dashboard" &&
    !path.startsWith("/profile")
  ) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, customer_id")
      .eq("id", user.id)
      .maybeSingle();

    const role = (profile?.role ?? null) as UserRole | null;

    if (role === "customer" && path !== "/pending-approval") {
      let customerStatus: string | null = null;
      if (profile?.customer_id) {
        const { data: customer } = await supabase
          .from("customers")
          .select("status")
          .eq("id", profile.customer_id)
          .maybeSingle();
        customerStatus = customer?.status ?? null;
      }
      if (customerStatus !== "active") {
        const url = request.nextUrl.clone();
        url.pathname = "/pending-approval";
        return NextResponse.redirect(url);
      }
    }

    if (role && role !== "admin") {
      const { data: permissionRows, error } = await supabase
        .from("role_page_permissions")
        .select("page_key, can_view")
        .eq("role", role)
        .eq("can_view", true);

      const allowed =
        error || !permissionRows || permissionRows.length === 0
          ? defaultAllowedKeysForRole(role)
          : new Set(permissionRows.map((row) => row.page_key as string));

      if (!pathAllowedByPageKeys(path, allowed)) {
        const url = request.nextUrl.clone();
        url.pathname = roleHomePath(role);
        return NextResponse.redirect(url);
      }
    }
  }

  // Unapproved customers landing on /dashboard still go to Pending Approval.
  if (user && path === "/dashboard") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, customer_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role === "customer") {
      let customerStatus: string | null = null;
      if (profile.customer_id) {
        const { data: customer } = await supabase
          .from("customers")
          .select("status")
          .eq("id", profile.customer_id)
          .maybeSingle();
        customerStatus = customer?.status ?? null;
      }
      if (customerStatus !== "active") {
        const url = request.nextUrl.clone();
        url.pathname = "/pending-approval";
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}
