"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, ExternalLink, Search, ShieldAlert } from "lucide-react";
import {
  CONTROLS_CATALOG,
  CONTROL_CATEGORY_ORDER,
  type ControlItem,
  type ControlWhereLink,
} from "@/lib/controls-catalog";
import { isAdminRole, type UserRole } from "@/lib/constants";

function categoryTone(category: string) {
  switch (category) {
    case "Access":
      return "badge-info";
    case "Contract":
      return "badge-primary";
    case "Work":
      return "badge-secondary";
    case "Billing":
      return "badge-warning";
    case "Payment":
      return "badge-success";
    case "Data Integrity":
      return "badge-accent";
    case "Accounting":
      return "badge-neutral";
    default:
      return "badge-ghost";
  }
}

function visibleWhereLinks(links: ControlWhereLink[], isAdmin: boolean) {
  return links.filter((link) => isAdmin || !link.adminOnly);
}

function ControlCard({ item, isAdmin }: { item: ControlItem; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const whereLinks = visibleWhereLinks(item.where, isAdmin);
  const hasHiddenAdminLinks = !isAdmin && item.where.some((link) => link.adminOnly);

  return (
    <article className="rounded-box border border-base-300 bg-base-100 shadow-sm overflow-hidden">
      <button
        type="button"
        className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-base-200/60"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
          <ShieldAlert className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 space-y-2">
          <span className="flex flex-wrap items-center gap-2">
            <span className={`badge badge-sm ${categoryTone(item.category)}`}>{item.category}</span>
            <span className="text-xs opacity-50">Click to explore</span>
          </span>
          <span className="block text-sm font-semibold leading-snug">{item.whatIf}</span>
          {!open ? (
            <span className="block text-xs leading-relaxed opacity-60 line-clamp-2">
              Risk: {item.risk}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={`mt-1 h-4 w-4 shrink-0 opacity-50 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="space-y-4 border-t border-base-300 bg-base-200/30 px-4 py-4 sm:px-5">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-error/20 bg-error/5 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-error">
                The risk
              </p>
              <p className="text-sm leading-relaxed">
                This business faces the risk that {item.risk}.
              </p>
            </div>
            <div className="rounded-lg border border-success/25 bg-success/5 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-success">
                The control
              </p>
              <p className="text-sm leading-relaxed">
                The system reduces that risk by ensuring {item.control}.
              </p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-60">
              Where to see it in the app
            </p>
            {whereLinks.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {whereLinks.map((link) => (
                  <Link
                    key={`${item.id}-${link.href}-${link.label}`}
                    href={link.href}
                    className="btn btn-outline btn-sm gap-1.5"
                  >
                    {link.label}
                    <ExternalLink className="h-3.5 w-3.5 opacity-60" aria-hidden />
                  </Link>
                ))}
              </div>
            ) : null}
            {hasHiddenAdminLinks ? (
              <p className={`text-xs opacity-60 ${whereLinks.length ? "mt-2" : ""}`}>
                {whereLinks.length
                  ? "Additional admin-only screens are available when signed in as Admin."
                  : "Demo screens for this control are admin-only — sign in as Admin to open them."}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}

/** Interactive risk → control → “open in app” explorer for Controls and Exceptions. */
export function ControlsExplorer({ role }: { role: UserRole }) {
  const isAdmin = isAdminRole(role);
  const [category, setCategory] = useState<string>("All");
  const [query, setQuery] = useState("");
  const [expandedCategory, setExpandedCategory] = useState<string | null>("Contract");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CONTROLS_CATALOG.filter((item) => {
      if (category !== "All" && item.category !== category) return false;
      if (!q) return true;
      return (
        item.whatIf.toLowerCase().includes(q) ||
        item.risk.toLowerCase().includes(q) ||
        item.control.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    });
  }, [category, query]);

  const byCategory = useMemo(() => {
    return CONTROL_CATEGORY_ORDER.map((cat) => ({
      category: cat,
      items: filtered.filter((item) => item.category === cat),
    })).filter((group) => group.items.length > 0);
  }, [filtered]);

  return (
    <div className="space-y-5">
      <section className="rounded-box border border-base-300 bg-base-100 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="input input-bordered input-sm flex items-center gap-2 max-w-md flex-1">
            <Search className="h-4 w-4 opacity-50" aria-hidden />
            <input
              type="search"
              className="grow"
              placeholder="Search risks, controls, or scenarios…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search controls"
            />
          </label>
          <span className="badge badge-ghost badge-sm">
            {filtered.length} of {CONTROLS_CATALOG.length}
          </span>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          <button
            type="button"
            className={`btn btn-sm ${category === "All" ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setCategory("All")}
          >
            All
          </button>
          {CONTROL_CATEGORY_ORDER.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`btn btn-sm ${category === cat ? "btn-primary" : "btn-ghost"}`}
              onClick={() => {
                setCategory(cat);
                setExpandedCategory(cat);
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </section>

      {byCategory.length === 0 ? (
        <div className="rounded-box border border-dashed border-base-300 bg-base-100 p-8 text-center text-sm opacity-70">
          No controls match that search. Try another keyword or clear the filter.
        </div>
      ) : (
        byCategory.map((group) => {
          const open = expandedCategory === group.category || category === group.category;
          return (
            <section key={group.category} className="space-y-3">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 text-left"
                onClick={() =>
                  setExpandedCategory((current) =>
                    current === group.category ? null : group.category
                  )
                }
                aria-expanded={open}
              >
                <h2 className="text-lg font-semibold">{group.category}</h2>
                <span className="flex items-center gap-2 text-sm opacity-60">
                  {group.items.length}
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
                    aria-hidden
                  />
                </span>
              </button>
              {open ? (
                <div className="space-y-3">
                  {group.items.map((item) => (
                    <ControlCard key={item.id} item={item} isAdmin={isAdmin} />
                  ))}
                </div>
              ) : null}
            </section>
          );
        })
      )}
    </div>
  );
}
