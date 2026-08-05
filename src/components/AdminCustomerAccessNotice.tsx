"use client";

import { useState } from "react";
import { Button } from "@/components/Button";

const ADMIN_CUSTOMER_ACCESS_SQL = `-- Paste into Supabase → SQL Editor → Run
-- Project: icymsjpkfddfrbbazxss

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customers_select_admin ON public.customers;
DROP POLICY IF EXISTS customers_insert_admin ON public.customers;
DROP POLICY IF EXISTS customers_update_admin ON public.customers;

CREATE POLICY customers_select_admin
ON public.customers
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
      AND lower(p.role::text) = 'admin'
  )
);

CREATE POLICY customers_insert_admin
ON public.customers
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
      AND lower(p.role::text) = 'admin'
  )
);

CREATE POLICY customers_update_admin
ON public.customers
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
      AND lower(p.role::text) = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
      AND lower(p.role::text) = 'admin'
  )
);
`;

export function AdminCustomerAccessNotice() {
  const [copied, setCopied] = useState(false);

  async function copySql() {
    try {
      await navigator.clipboard.writeText(ADMIN_CUSTOMER_ACCESS_SQL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="rounded-box border border-warning/40 bg-warning/10 p-4">
      <p className="text-sm font-medium">Admin customer access needs a one-time Supabase fix</p>
      <p className="mt-1 text-sm opacity-80">
        Your Admin login can open Customers in the app, but Row Level Security is still blocking
        customer rows. Run the SQL below in the Supabase SQL Editor for project{" "}
        <span className="font-mono">icymsjpkfddfrbbazxss</span>, then refresh this page.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => void copySql()}>
          {copied ? "Copied" : "Copy SQL"}
        </Button>
      </div>
      <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-base-100 p-3 text-xs whitespace-pre-wrap">
        {ADMIN_CUSTOMER_ACCESS_SQL}
      </pre>
    </div>
  );
}
