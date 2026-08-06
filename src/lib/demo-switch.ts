"use client";

import { createClient } from "@/lib/supabase/client";
import { roleHomePath, type UserRole } from "@/lib/constants";

type SwitchResult =
  | { ok: true; homePath: string }
  | { ok: false; error: string };

/**
 * Password-free demo role switch via server route (Demo Mode only).
 * Credentials never leave the server.
 */
export async function switchDemoRole(role: UserRole): Promise<SwitchResult> {
  try {
    const res = await fetch("/api/demo/switch-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      homePath?: string;
      error?: string;
    };

    if (!res.ok) {
      return {
        ok: false,
        error: data.error || "Unable to switch demo role. Try again.",
      };
    }

    if (!data.access_token || !data.refresh_token) {
      return { ok: false, error: "Demo session was not returned. Try again." };
    }

    const supabase = createClient();
    const { error } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });
    if (error) {
      return { ok: false, error: error.message || "Could not apply demo session." };
    }

    return {
      ok: true,
      homePath: data.homePath || roleHomePath(role),
    };
  } catch {
    return { ok: false, error: "Network error while switching demo role." };
  }
}
