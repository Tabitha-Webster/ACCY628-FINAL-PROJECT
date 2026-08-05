import { redirect } from "next/navigation";

export default function ReadyToBillRedirectPage() {
  redirect("/billing-review");
}
