"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { createClient } from "@/lib/supabase/client";

type Props = {
  customerId: string;
  customerName: string;
  /** Current customer status — used only to avoid re-deactivating. */
  currentStatus: string | null;
};

/**
 * Deactivate a customer (status → inactive) when they have no active contracts.
 * Never permanently deletes the customer row or modifies contracts / related history.
 */
export function DeleteCustomerButton({ customerId, customerName, currentStatus }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const alreadyInactive = (currentStatus ?? "").toLowerCase() === "inactive";

  async function onDeactivate() {
    setError(null);
    setMessage(null);

    if (alreadyInactive) {
      setMessage("This customer is already inactive. Historical contracts and invoices remain on file.");
      return;
    }

    setBusy(true);
    const supabase = createClient();

    const { count, error: contractsError } = await supabase
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId)
      .eq("status", "active");

    if (contractsError) {
      setBusy(false);
      setError(`Could not check contracts before deactivating. ${contractsError.message}`);
      return;
    }

    const activeCount = count ?? 0;
    if (activeCount > 0) {
      setBusy(false);
      setError(
        `This customer cannot be deactivated because ${activeCount} active contract${
          activeCount === 1 ? " is" : "s are"
        } still linked to the account. End or cancel those contracts first. No contracts or invoices were changed.`
      );
      return;
    }

    const label = customerName.trim() || "this customer";
    const confirmed = window.confirm(
      `Mark ${label} as Inactive?\n\nThe customer record will remain in the system so historical contracts, invoices, and related records stay available. This is not a permanent delete.\n\nNo contracts will be deleted or modified.`
    );
    if (!confirmed) {
      setBusy(false);
      return;
    }

    const { error: deactivateError } = await supabase
      .from("customers")
      .update({ status: "inactive" })
      .eq("id", customerId);

    setBusy(false);

    if (deactivateError) {
      setError(`Could not deactivate this customer. ${deactivateError.message}`);
      return;
    }

    setMessage(
      `${label} is now Inactive. The customer profile remains available, and historical contracts, invoices, and related records were preserved. No contracts were changed.`
    );
    window.setTimeout(() => {
      router.refresh();
    }, 1200);
  }

  return (
    <div className="space-y-2">
      {error ? <div className="alert alert-error text-sm max-w-xl">{error}</div> : null}
      {message ? <div className="alert alert-success text-sm max-w-xl">{message}</div> : null}
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={busy || alreadyInactive}
        onClick={() => void onDeactivate()}
        title={
          alreadyInactive
            ? "This customer is already inactive"
            : "Mark this customer inactive without deleting history"
        }
      >
        {busy ? "Working…" : alreadyInactive ? "Already Inactive" : "Deactivate Customer"}
      </Button>
    </div>
  );
}
