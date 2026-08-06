"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { hrefAllowedByPageKeys } from "@/lib/role-permissions";

type NavLink = { href: string; label: string };

function pathActive(pathname: string, href: string) {
  if (href === "/contracts") {
    return (
      pathname === "/contracts" ||
      /^\/contracts\/(?!reports(?:\/|$)|renewals(?:\/|$)|customers(?:\/|$)|new(?:\/|$)|awaiting-signature(?:\/|$)|view-edit(?:\/|$)|[^/]+\/(?:view|edit)(?:\/|$)).+/.test(
        pathname
      )
    );
  }
  if (href === "/contracts/view-edit") {
    return (
      pathname === href ||
      /^\/contracts\/[^/]+\/(?:view|edit)(?:\/|$)/.test(pathname)
    );
  }
  return pathname === href || pathname.startsWith(href + "/");
}

function sectionActive(pathname: string, links: NavLink[]) {
  return links.some((link) => pathActive(pathname, link.href));
}

export function ContractsAgreementsNavTree({
  showReports = true,
  showNewContract = false,
  showCustomerContractData = false,
  showAwaitingSignature = false,
  showViewEditContracts = false,
  showRenewals = true,
  onNavigate,
  allowedPageKeys = null,
}: {
  showReports?: boolean;
  showNewContract?: boolean;
  showCustomerContractData?: boolean;
  showAwaitingSignature?: boolean;
  showViewEditContracts?: boolean;
  showRenewals?: boolean;
  onNavigate?: () => void;
  allowedPageKeys?: Set<string> | null;
}) {
  const pathname = usePathname();
  const allLinks: NavLink[] = useMemo(
    () => [
      ...(showReports ? [{ href: "/contracts/reports", label: "Contracts Dashboard" }] : []),
      { href: "/contracts", label: "Manage Contracts" },
      ...(showViewEditContracts
        ? [{ href: "/contracts/view-edit", label: "View and Edit Contracts" }]
        : []),
      ...(showAwaitingSignature
        ? [{ href: "/contracts/awaiting-signature", label: "Awaiting Your Signature" }]
        : []),
      ...(showNewContract ? [{ href: "/contracts/new", label: "New Contract" }] : []),
      ...(showRenewals ? [{ href: "/contracts/renewals", label: "Renewal & Expiration" }] : []),
      ...(showCustomerContractData
        ? [{ href: "/contracts/customers", label: "Customer Contract Data" }]
        : []),
    ],
    [
      showReports,
      showNewContract,
      showCustomerContractData,
      showAwaitingSignature,
      showViewEditContracts,
      showRenewals,
    ]
  );
  const links = useMemo(
    () => allLinks.filter((link) => hrefAllowedByPageKeys(link.href, allowedPageKeys)),
    [allLinks, allowedPageKeys]
  );
  const [open, setOpen] = useState(
    () => sectionActive(pathname, allLinks) || pathname.startsWith("/contracts")
  );

  if (links.length === 0) return null;

  return (
    <div className="space-y-1">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-base-200"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>Contracts &amp; Agreements</span>
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
