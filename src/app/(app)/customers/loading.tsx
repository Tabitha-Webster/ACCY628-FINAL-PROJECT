import { PageLayout } from "@/components/PageLayout";
import { Button } from "@/components/Button";

/** Shown while the customers route is loading from Supabase. */
export default function CustomersLoading() {
  return (
    <PageLayout
      title="Customers"
      description="Loading customer accounts from Supabase…"
      actions={
        <Button type="button" variant="primary" size="sm" disabled>
          Add Customer
        </Button>
      }
    >
      <div className="space-y-3" aria-busy="true" aria-live="polite">
        <p className="text-sm opacity-70">Retrieving customer records…</p>
        <div className="overflow-hidden rounded-box border border-base-300 bg-base-100">
          <div className="border-b border-base-300 bg-base-200/60 px-4 py-3">
            <div className="skeleton h-3 w-full max-w-3xl" />
          </div>
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="flex items-center gap-4 border-b border-base-200 px-4 py-3 last:border-b-0"
            >
              <div className="skeleton h-3 w-20 shrink-0" />
              <div className="skeleton h-3 w-40 shrink-0" />
              <div className="skeleton h-5 w-24 shrink-0" />
              <div className="skeleton h-3 w-28 shrink-0" />
              <div className="skeleton h-3 w-32 shrink-0" />
              <div className="skeleton h-3 min-w-0 flex-1" />
            </div>
          ))}
        </div>
      </div>
    </PageLayout>
  );
}
