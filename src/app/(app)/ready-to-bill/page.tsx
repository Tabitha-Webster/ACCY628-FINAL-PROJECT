import { redirect } from "next/navigation";

/** Legacy path — Billing Review is the current invoice-prep surface. */
export default function ReadyToBillRedirectPage() {
  redirect("/billing-review");
}
