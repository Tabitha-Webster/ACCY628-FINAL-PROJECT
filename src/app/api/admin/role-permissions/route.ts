import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole, type UserRole } from "@/lib/constants";
import { EDITABLE_PAGE_PERMISSIONS, type PagePermissionKey } from "@/lib/role-permissions";
import { upsertRolePagePermissions } from "@/lib/role-permissions-data";

type Body = {
  updates?: { role?: string; page_key?: string; can_view?: boolean }[];
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
    return NextResponse.json({ error: "Only Admin can change role permissions." }, { status: 403 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const editableKeys = new Set(EDITABLE_PAGE_PERMISSIONS.map((page) => page.key));
  const updates = (body.updates ?? [])
    .filter((row) => row.role && row.page_key && typeof row.can_view === "boolean")
    .map((row) => ({
      role: row.role as UserRole,
      page_key: row.page_key as PagePermissionKey,
      can_view: Boolean(row.can_view),
    }))
    .filter((row) => row.role !== "admin" && editableKeys.has(row.page_key));

  if (updates.length === 0) {
    return NextResponse.json({ error: "No valid permission updates provided." }, { status: 400 });
  }

  const { error } = await upsertRolePagePermissions(updates, profile.id);
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: updates.length });
}
