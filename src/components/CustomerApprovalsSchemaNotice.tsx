/** Shown when live Supabase cannot store/query pending_approval customers. */
export function CustomerApprovalsSchemaNotice() {
  return (
    <div className="rounded-box border border-warning/40 bg-warning/10 p-4 text-sm">
      <p className="font-semibold">Approvals queue is not ready in the live database</p>
      <p className="mt-2 opacity-80">
        Supabase does not support <code className="text-xs">pending_approval</code> yet, so Chad (and new
        signups) cannot appear here. Run the demo SQL in the Supabase SQL Editor, then refresh this page.
      </p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 opacity-80">
        <li>
          Open{" "}
          <a
            className="link link-primary"
            href="https://supabase.com/dashboard/project/icymsjpkfddfrbbazxss/sql/new"
            target="_blank"
            rel="noreferrer"
          >
            Supabase SQL Editor
          </a>
        </li>
        <li>
          Run <code className="text-xs">scripts/demo-chad-pending-approval.sql</code> — Step 1, then Step 2
          separately
        </li>
        <li>Refresh this Approvals page — Chad Corporation should appear</li>
      </ol>
      <p className="mt-3 opacity-70">
        File in the repo:{" "}
        <code className="text-xs">scripts/demo-chad-pending-approval.sql</code>
      </p>
    </div>
  );
}
