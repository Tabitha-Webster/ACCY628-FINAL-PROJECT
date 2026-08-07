import { requireAdmin } from "@/lib/admin";

export default async function AdminHomePage() {
  await requireAdmin();

  return <div className="min-h-[40vh]" aria-label="Admin home" />;
}
