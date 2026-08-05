import { PageHeader } from "@/components/ui";

export default function TicketDetailLoading() {
  return (
    <div>
      <PageHeader title="Loading ticket…" description="Fetching the latest details from Supabase." />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="skeleton h-40 w-full rounded-box" />
          <div className="skeleton h-52 w-full rounded-box" />
          <div className="skeleton h-40 w-full rounded-box" />
        </div>
        <div className="space-y-4">
          <div className="skeleton h-48 w-full rounded-box" />
          <div className="skeleton h-64 w-full rounded-box" />
        </div>
      </div>
    </div>
  );
}
