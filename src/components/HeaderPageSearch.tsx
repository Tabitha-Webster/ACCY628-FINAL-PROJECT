"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { filterPagesCaseInsensitive, pagesForRole } from "@/lib/nav-pages";
import type { UserRole } from "@/lib/constants";

export function HeaderPageSearch({
  role,
  allowedPageKeys = null,
  restrictedCustomer = false,
}: {
  role: UserRole;
  allowedPageKeys?: Set<string> | null;
  restrictedCustomer?: boolean;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const pages = useMemo(
    () => pagesForRole(role, allowedPageKeys, restrictedCustomer),
    [role, allowedPageKeys, restrictedCustomer]
  );

  const matches = useMemo(() => filterPagesCaseInsensitive(pages, query), [pages, query]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function goTo(href: string) {
    setQuery("");
    setOpen(false);
    setActiveIndex(0);
    router.push(href);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, Math.max(matches.length - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const target = matches[activeIndex];
      if (target) goTo(target.href);
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
      setActiveIndex(0);
    }
  }

  return (
    <div ref={rootRef} className="relative w-44 sm:w-56 md:w-64">
      <label className="input input-bordered input-sm flex items-center gap-2 bg-base-100">
        <Search className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
        <input
          type="search"
          className="grow bg-transparent text-sm outline-none"
          placeholder="Search pages…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          aria-label="Search pages on your screen"
          aria-controls="header-page-search-results"
          autoComplete="off"
        />
      </label>

      {open && query.trim() ? (
        <ul
          id="header-page-search-results"
          className="absolute right-0 z-40 mt-1 max-h-72 w-72 overflow-y-auto rounded-box border border-base-300 bg-base-100 p-1 shadow-lg sm:w-80"
          role="listbox"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm opacity-60">No matching pages</li>
          ) : (
            matches.map((page, index) => (
              <li key={page.href} role="option" aria-selected={index === activeIndex}>
                <button
                  type="button"
                  className={`flex w-full flex-col items-start rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    index === activeIndex ? "bg-primary text-primary-content" : "hover:bg-base-200"
                  }`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => goTo(page.href)}
                >
                  <span className="font-medium">{page.label}</span>
                  <span className={`text-xs ${index === activeIndex ? "opacity-80" : "opacity-60"}`}>
                    {page.group ? `${page.group} · ` : ""}
                    {page.href}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
