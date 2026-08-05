import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/constants";

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, customer_id, internal_cost_rate, is_demo_user, is_active")
    .eq("id", user.id)
    .maybeSingle();

  return data as Profile | null;
}
