"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

type NavLink = { href: string; label: string };

function pathActive(pathname: string, href: string) {
  if (href === "/contracts") {
    // Avoid treating /contracts/reports as the manage-contracts page.
    return pathname === "/contracts" || /^\/contracts\/(?!reports(?:\/|$)).+/.test(pathname);
  }
  return pathname === href || pathname.startsWith(href + "/");
}

function sectionActive(pathname: string, links: NavLink[]) {
  return links.some((link) => pathActive(pathname, link.href));
}

export function ContractsAgreementsNavTree({
  showReports = true,
  onNavigate,
}: {
  showReports?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const links: NavLink[] = [
    { href: "/contracts", label: "Manage Contracts" },
    ...(showReports ? [{ href: "/contracts/reports", label: "Reports" }] : []),
  ];
  const [open, setOpen] = useState(() => sectionActive(pathname, links));

  return (
    <div className="space-y-1">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-base-200"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>Contracts & Agreements</span>
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
