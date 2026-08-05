import { redirect } from "next/navigation";

/** Legacy path — the billing Overview is the current invoice-prep / contract-to-cash surface. */
export default function ReadyToBillRedirectPage() {
  redirect("/billing-review");
}
