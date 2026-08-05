import { redirect } from "next/navigation";

/** Legacy route — Billing Review is the contract-to-cash workspace on main. */
export default function ReadyToBillRedirectPage() {
  redirect("/billing-review");
}
