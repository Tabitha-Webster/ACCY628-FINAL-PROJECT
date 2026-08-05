"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

export function CustomerBillingNavTree({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(
    pathname.startsWith("/my-invoices") || pathname.startsWith("/make-payment")
  );

  const invoicesActive = pathname === "/my-invoices" || pathname.startsWith("/my-invoices/");
  const paymentActive = pathname === "/make-payment" || pathname.startsWith("/make-payment/");

  return (
    <li>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="font-medium">Invoices</span>
        {open ? <ChevronDown className="h-4 w-4 opacity-70" /> : <ChevronRight className="h-4 w-4 opacity-70" />}
      </button>

      {open ? (
        <ul className="ml-2 mt-1 space-y-1 border-l border-base-300 pl-2">
          <li>
            <Link
              href="/my-invoices"
              className={invoicesActive ? "active" : ""}
              onClick={onNavigate}
            >
              View Invoices
            </Link>
          </li>
          <li>
            <Link
              href="/make-payment"
              className={paymentActive ? "active" : ""}
              onClick={onNavigate}
            >
              Make a Payment
            </Link>
          </li>
        </ul>
      ) : null}
    </li>
  );
}
