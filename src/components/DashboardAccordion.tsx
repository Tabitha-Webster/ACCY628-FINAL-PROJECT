"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { ExplainNumber, type MetricExplanation } from "@/components/ExplainNumber";

export function DashboardSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">{title}</h2>
        {description ? <p className="mt-1 text-sm opacity-70">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function DashboardMetricAccordion({
  label,
  value,
  hint,
  tone = "default",
  explanation,
  href,
  hrefLabel = "View details",
  defaultOpen = false,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "warning" | "error" | "info";
  explanation?: MetricExplanation;
  href?: string;
  hrefLabel?: string;
  defaultOpen?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const rootRef = useRef<HTMLDivElement>(null);
  const border =
    tone === "success"
      ? "border-success/40"
      : tone === "warning"
        ? "border-warning/40"
        : tone === "error"
          ? "border-error/40"
          : tone === "info"
            ? "border-info/40"
            : "border-base-300";

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function MetricHeader() {
    return (
      <button
        type="button"
        className="flex h-full min-h-[7.5rem] w-full items-start justify-between gap-3 p-4 text-left"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide opacity-60">{label}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
          <p className="mt-1 line-clamp-2 min-h-[2rem] text-xs opacity-60">{hint ?? "\u00a0"}</p>
        </div>
        <ChevronDown className={`mt-1 size-4 shrink-0 opacity-50 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
    );
  }

  return (
    <div ref={rootRef} className={`relative h-full ${open ? "z-40" : "z-0"}`}>
      <div className={`h-full rounded-box border ${border} bg-base-100 shadow-sm ${open ? "invisible" : ""}`}>
        <MetricHeader />
      </div>

      {open ? (
        <div
          className={`absolute left-0 top-0 z-50 w-full min-w-full overflow-hidden rounded-box border ${border} bg-base-100 shadow-xl ring-1 ring-base-300/60`}
          role="dialog"
          aria-label={`${label} details`}
        >
          <MetricHeader />
          <div className="max-h-72 space-y-3 overflow-auto border-t border-base-300 px-4 py-3 sm:max-h-96">
            {children}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {explanation ? <ExplainNumber explanation={explanation} /> : <span />}
              {href ? (
                <Link href={href} className="link link-hover text-sm" onClick={(event) => event.stopPropagation()}>
                  {hrefLabel}
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function DashboardCollapse({
  title,
  defaultOpen = false,
  actions,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-box border border-base-300 bg-base-100 shadow-sm">
      <div className="flex items-center justify-between gap-3 p-4">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <h3 className="text-sm font-semibold">{title}</h3>
          <span className="flex shrink-0 items-center gap-2">
            <span className="text-xs opacity-60">{open ? "Hide" : "Show"}</span>
            <ChevronDown className={`size-4 opacity-50 transition-transform ${open ? "rotate-180" : ""}`} />
          </span>
        </button>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {open ? <div className="border-t border-base-300 px-4 py-3">{children}</div> : null}
    </div>
  );
}

/** Compact action row for dashboard hubs — links to the real work pages. */
export function DashboardHubShortcuts({
  links,
}: {
  links: { href: string; label: string; primary?: boolean }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => (
        <Link
          key={link.href + link.label}
          href={link.href}
          className={link.primary ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm"}
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}
