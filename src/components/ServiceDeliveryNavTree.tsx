"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { hrefAllowedByPageKeys } from "@/lib/role-permissions";

type NavLink = { href: string; label: string };

const SERVICE_DELIVERY_LINKS: NavLink[] = [
  { href: "/tickets", label: "Support Tickets" },
  { href: "/projects", label: "Project Tasks" },
  { href: "/time-costs", label: "Submit Time and Costs" },
  { href: "/additional-work", label: "Additional Work Requests" },
];

function pathActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

function sectionActive(pathname: string, links: NavLink[]) {
  return links.some((link) => pathActive(pathname, link.href));
}

export function ServiceDeliveryNavTree({
  onNavigate,
  allowedPageKeys = null,
}: {
  onNavigate?: () => void;
  allowedPageKeys?: Set<string> | null;
}) {
  const pathname = usePathname();
  const links = useMemo(
    () => SERVICE_DELIVERY_LINKS.filter((link) => hrefAllowedByPageKeys(link.href, allowedPageKeys)),
    [allowedPageKeys]
  );
  const [open, setOpen] = useState(() => sectionActive(pathname, SERVICE_DELIVERY_LINKS));

  useEffect(() => {
    if (sectionActive(pathname, SERVICE_DELIVERY_LINKS)) {
      setOpen(true);
    }
  }, [pathname]);

  if (links.length === 0) return null;

  return (
    <div className="space-y-1">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-base-200"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>Service Delivery</span>
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
