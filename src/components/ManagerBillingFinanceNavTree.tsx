"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { hrefAllowedByPageKeys } from "@/lib/role-permissions";

type NavLink = { href: string; label: string };

export const MANAGER_BILLING_FINANCE_LINKS: NavLink[] = [
  { href: "/time-cost-approvals", label: "Approve Time & Costs" },
  { href: "/profitability", label: "Profitability" },
  { href: "/billing-collections", label: "Billing and Collections" },
  { href: "/payments", label: "Payment History" },
];

function pathActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

function sectionActive(pathname: string, links: NavLink[]) {
  return links.some((link) => pathActive(pathname, link.href));
}

export function ManagerBillingFinanceNavTree({
  onNavigate,
  allowedPageKeys = null,
}: {
  onNavigate?: () => void;
  allowedPageKeys?: Set<string> | null;
}) {
  const pathname = usePathname();
  const links = useMemo(
    () => MANAGER_BILLING_FINANCE_LINKS.filter((link) => hrefAllowedByPageKeys(link.href, allowedPageKeys)),
    [allowedPageKeys]
  );
  const [open, setOpen] = useState(() => sectionActive(pathname, MANAGER_BILLING_FINANCE_LINKS));

  if (links.length === 0) return null;

  return (
    <div className="space-y-1">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-base-200"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>Billing &amp; Finance</span>
        {open ? (
          <Minus className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
        ) : (
          <Plus className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
        )}
      </button>

      {open ? (
        <div className="ml-2 space-y-1 border-l border-base-300 pl-2">
          {links.map((link) => {
            const active = pathActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active ? "bg-primary text-primary-content" : "hover:bg-base-200"
                }`}
                onClick={onNavigate}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
