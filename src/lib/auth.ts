import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/constants";
import type { CustomerStatus } from "@/lib/types";

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

export type LinkedCustomerSummary = {
  id: string;
  name: string;
  status: CustomerStatus;
  approval_note: string | null;
};

export async function getLinkedCustomer(
  profile: Profile
): Promise<LinkedCustomerSummary | null> {
  if (!profile.customer_id) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("customers")
    .select("id, name, status, approval_note")
    .eq("id", profile.customer_id)
    .maybeSingle();
  return (data as LinkedCustomerSummary | null) ?? null;
}

export function isCustomerApproved(status: CustomerStatus | null | undefined) {
  return status === "active";
}

export function isCustomerAwaitingApproval(status: CustomerStatus | null | undefined) {
  return status === "pending_approval";
}

/** Blocks ticket/contract/billing routes until the customer is approved. */
export async function requireApprovedCustomer(profile: Profile) {
  if (profile.role !== "customer") return null;
  const customer = await getLinkedCustomer(profile);
  if (!customer || !isCustomerApproved(customer.status)) {
    redirect("/pending-approval");
  }
  return customer;
}
