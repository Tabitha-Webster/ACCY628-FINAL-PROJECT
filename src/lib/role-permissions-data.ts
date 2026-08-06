import { createClient } from "@/lib/supabase/server";
import {
  defaultAllowedKeysForRole,
  EDITABLE_PAGE_PERMISSIONS,
  PAGE_PERMISSION_CATALOG,
  type PagePermissionKey,
} from "@/lib/role-permissions";
import { isAdminRole, type UserRole } from "@/lib/constants";

export type RolePagePermissionRow = {
  role: UserRole;
  page_key: string;
  can_view: boolean;
};

/** Load allowed page keys for a role. Falls back to catalog defaults if the table is missing. */
export async function loadAllowedPageKeysForRole(role: UserRole): Promise<string[]> {
  if (isAdminRole(role)) {
    return PAGE_PERMISSION_CATALOG.map((page) => page.key);
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("role_page_permissions")
      .select("page_key, can_view")
      .eq("role", role)
      .eq("can_view", true);

    if (error || !data || data.length === 0) {
      return Array.from(defaultAllowedKeysForRole(role));
    }

    return data.map((row) => row.page_key as string);
  } catch {
    return Array.from(defaultAllowedKeysForRole(role));
  }
}

/** Full matrix for the Role Permissions admin screen. */
export async function loadRolePermissionMatrix(): Promise<RolePagePermissionRow[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("role_page_permissions").select("role, page_key, can_view");

    if (error || !data || data.length === 0) {
      return fallbackMatrix();
    }

    return data.map((row) => ({
      role: row.role as UserRole,
      page_key: row.page_key as string,
      can_view: Boolean(row.can_view),
    }));
  } catch {
    return fallbackMatrix();
  }
}

function fallbackMatrix(): RolePagePermissionRow[] {
  const rows: RolePagePermissionRow[] = [];
  for (const page of PAGE_PERMISSION_CATALOG) {
    for (const role of page.defaultRoles) {
      rows.push({ role, page_key: page.key, can_view: true });
    }
    for (const role of ["manager", "technician", "billing", "customer", "hr"] as UserRole[]) {
      if (!page.defaultRoles.includes(role)) {
        rows.push({ role, page_key: page.key, can_view: false });
      }
    }
    if (!page.defaultRoles.includes("admin")) {
      rows.push({ role: "admin", page_key: page.key, can_view: true });
    }
  }
  return rows;
}

export async function upsertRolePagePermissions(
  updates: { role: UserRole; page_key: PagePermissionKey; can_view: boolean }[],
  updatedBy: string
) {
  const editableKeys = new Set(EDITABLE_PAGE_PERMISSIONS.map((page) => page.key));
  const sanitized = updates.filter(
    (row) => row.role !== "admin" && editableKeys.has(row.page_key)
  );

  if (sanitized.length === 0) {
    return { error: "No valid permission updates." as string | null };
  }

  const supabase = await createClient();
  const payload = sanitized.map((row) => ({
    role: row.role,
    page_key: row.page_key,
    can_view: row.can_view,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  }));

  const { error } = await supabase.from("role_page_permissions").upsert(payload, {
    onConflict: "role,page_key",
  });

  return { error: error?.message ?? null };
}
