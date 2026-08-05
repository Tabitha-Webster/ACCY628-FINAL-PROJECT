"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

type NavLink = { href: string; label: string };

const BILLING_LINKS: NavLink[] = [
  { href: "/billing-review", label: "Billing Review" },
  { href: "/billing-cost-approvals", label: "Approve Costs" },
  { href: "/invoices", label: "Invoices" },
  { href: "/hr-analytics", label: "HR Cost Analytics" },
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

  return (
    <div className="space-y-1">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-base-200"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{title}</span>
        {open ? <ChevronDown className="h-4 w-4 opacity-70" /> : <ChevronRight className="h-4 w-4 opacity-70" />}
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

export function BillingStaffNavTree({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="space-y-1">
      <NavSection title="Billing" links={BILLING_LINKS} onNavigate={onNavigate} />
      <NavSection title="Collections" links={COLLECTIONS_LINKS} onNavigate={onNavigate} />
      <NavSection title="Accounting" links={ACCOUNTING_LINKS} onNavigate={onNavigate} />
    </div>
  );
}
