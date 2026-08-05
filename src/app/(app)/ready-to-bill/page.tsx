import { redirect } from "next/navigation";

/** Legacy path — Billing Review is the current invoice-prep / contract-to-cash surface. */
export default function ReadyToBillRedirectPage() {
  redirect("/billing-review");
}
