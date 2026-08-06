"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { hrefAllowedByPageKeys } from "@/lib/role-permissions";

export function CustomerBillingNavTree({
  onNavigate,
  allowedPageKeys = null,
}: {
  onNavigate?: () => void;
  allowedPageKeys?: Set<string> | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(
    pathname.startsWith("/my-invoices") || pathname.startsWith("/make-payment")
  );

  const showInvoices = hrefAllowedByPageKeys("/my-invoices", allowedPageKeys);
  const showPayment = hrefAllowedByPageKeys("/make-payment", allowedPageKeys);
  if (!showInvoices && !showPayment) return null;

  const invoicesActive = pathname === "/my-invoices" || pathname.startsWith("/my-invoices/");
  const paymentActive = pathname === "/make-payment" || pathname.startsWith("/make-payment/");

  return (
    <div className="ml-2 space-y-1 border-l border-base-300 pl-2">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-base-200"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>Invoices</span>
        {open ? (
          <Minus className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
        ) : (
          <Plus className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
        )}
      </button>

      {open ? (
        <div className="ml-2 space-y-1 border-l border-base-300 pl-2">
          {showInvoices ? (
            <Link
              href="/my-invoices"
              className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                invoicesActive ? "bg-primary text-primary-content" : "hover:bg-base-200"
              }`}
              onClick={onNavigate}
            >
              View Invoices
            </Link>
          ) : null}
          {showPayment ? (
            <Link
              href="/make-payment"
              className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                paymentActive ? "bg-primary text-primary-content" : "hover:bg-base-200"
              }`}
              onClick={onNavigate}
            >
              Make a Payment
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
