"use client";

import { useState } from "react";
import { Button } from "@/components/Button";
import {
  CUSTOMERS_IDENTIFIER_BILLING_SQL,
  CUSTOMERS_SCHEMA_SQL_EDITOR_URL,
} from "@/lib/customers/schema-migration-sql";

/** Shown when live Supabase is missing customer_identifier / billing columns. */
export function CustomerSchemaNotice() {
  const [copied, setCopied] = useState(false);

  async function copySql() {
    try {
      await navigator.clipboard.writeText(CUSTOMERS_IDENTIFIER_BILLING_SQL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="rounded-box border border-warning/40 bg-warning/10 p-4 text-sm">
      <p className="font-semibold">Customer schema update required in Supabase</p>
      <p className="mt-1 opacity-80">
        The app is ready for unique <span className="font-mono text-xs">CUST-#####</span> identifiers
        and dedicated billing/phone columns. Those columns are not on the live database yet, so the
        list falls back to truncated UUIDs and billing may still come from notes. Run this SQL once
        in the Supabase SQL Editor, then refresh.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="primary" size="sm" onClick={() => void copySql()}>
          {copied ? "Copied" : "Copy SQL"}
        </Button>
        <a
          className="btn btn-sm"
          href={CUSTOMERS_SCHEMA_SQL_EDITOR_URL}
          target="_blank"
          rel="noreferrer"
        >
          Open SQL Editor
        </a>
      </div>
      <pre className="mt-3 max-h-64 overflow-auto rounded-box border border-base-300 bg-base-100 p-3 text-xs">
        {CUSTOMERS_IDENTIFIER_BILLING_SQL}
      </pre>
    </div>
  );
}
