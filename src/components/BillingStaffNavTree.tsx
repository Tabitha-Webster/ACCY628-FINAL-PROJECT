"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { hrefAllowedByPageKeys } from "@/lib/role-permissions";

type NavLink = { href: string; label: string };

const BILLING_LINKS: NavLink[] = [
  { href: "/billing-review", label: "Overview" },
  { href: "/billing-cost-approvals", label: "Approve Costs" },
  { href: "/invoices", label: "Invoices" },
];

const COLLECTIONS_LINKS: NavLink[] = [
  { href: "/accounts-receivable", label: "Accounts Receivable" },
  { href: "/payments", label: "Payment History" },
];

const ACCOUNTING_LINKS: NavLink[] = [{ href: "/accounting", label: "Accounting Review" }];

function pathActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

function sectionActive(pathname: string, links: NavLink[]) {
  return links.some((link) => pathActive(pathname, link.href));
}

function NavSection({
  title,
  links,
  onNavigate,
}: {
  title: string;
  links: NavLink[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(() => sectionActive(pathname, links));

  if (links.length === 0) return null;

  return (
    <div className="space-y-1">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-base-200"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{title}</span>
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

export function BillingStaffNavTree({
  onNavigate,
  allowedPageKeys = null,
}: {
  onNavigate?: () => void;
  allowedPageKeys?: Set<string> | null;
}) {
  const billing = useMemo(
    () => BILLING_LINKS.filter((link) => hrefAllowedByPageKeys(link.href, allowedPageKeys)),
    [allowedPageKeys]
  );
  const collections = useMemo(
    () => COLLECTIONS_LINKS.filter((link) => hrefAllowedByPageKeys(link.href, allowedPageKeys)),
    [allowedPageKeys]
  );
  const accounting = useMemo(
    () => ACCOUNTING_LINKS.filter((link) => hrefAllowedByPageKeys(link.href, allowedPageKeys)),
    [allowedPageKeys]
  );

  if (billing.length + collections.length + accounting.length === 0) return null;

  return (
    <div className="space-y-1">
      <NavSection title="Billing" links={billing} onNavigate={onNavigate} />
      <NavSection title="Collections" links={collections} onNavigate={onNavigate} />
      <NavSection title="Accounting" links={accounting} onNavigate={onNavigate} />
    </div>
  );
}
