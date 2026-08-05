"use client";

import { useState } from "react";
import { Button } from "@/components/Button";

const HR_CUSTOMER_ACCESS_SQL = `-- Paste into Supabase → SQL Editor → Run
-- Project: icymsjpkfddfrbbazxss

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customers_select_hr ON public.customers;
DROP POLICY IF EXISTS customers_insert_hr ON public.customers;
DROP POLICY IF EXISTS customers_update_hr ON public.customers;

CREATE POLICY customers_select_hr
ON public.customers
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
      AND lower(p.role::text) = 'hr'
  )
);

CREATE POLICY customers_insert_hr
ON public.customers
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
      AND lower(p.role::text) = 'hr'
  )
);

CREATE POLICY customers_update_hr
ON public.customers
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
      AND lower(p.role::text) = 'hr'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
      AND lower(p.role::text) = 'hr'
  )
);`;

export function HrCustomerAccessNotice() {
  const [copied, setCopied] = useState(false);

  async function copySql() {
    try {
      await navigator.clipboard.writeText(HR_CUSTOMER_ACCESS_SQL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="rounded-box border border-warning/40 bg-warning/10 p-4 text-sm">
      <p className="font-semibold">HR customer access is blocked in Supabase</p>
      <p className="mt-1 opacity-80">
        The app is ready for HR to list, add, and edit customers like Manager. Supabase row-level
        security is still hiding those rows from the HR login. Run this SQL once in the Supabase SQL
        Editor, then refresh this page.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="primary" size="sm" onClick={() => void copySql()}>
          {copied ? "Copied" : "Copy SQL"}
        </Button>
        <a
          className="btn btn-sm"
          href="https://supabase.com/dashboard/project/icymsjpkfddfrbbazxss/sql/new"
          target="_blank"
          rel="noreferrer"
        >
          Open SQL Editor
        </a>
      </div>
      <pre className="mt-3 max-h-64 overflow-auto rounded-box border border-base-300 bg-base-100 p-3 text-xs">
        {HR_CUSTOMER_ACCESS_SQL}
      </pre>
    </div>
  );
}
