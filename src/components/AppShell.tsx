"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu } from "lucide-react";
import { DemoRoleSwitcher } from "@/components/DemoRoleSwitcher";
import { ROLE_NAV, type Profile, type UserRole } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { statusLabel } from "@/lib/format";
import type { CustomerStatus } from "@/lib/types";
import { useEffect, useState } from "react";

export function AppShell({
  profile,
  customerStatus = null,
  children,
}: {
  profile: Profile;
  customerStatus?: CustomerStatus | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const restrictedCustomer =
    profile.role === "customer" &&
    (customerStatus === "pending_approval" || customerStatus === "rejected");

  const nav = restrictedCustomer
    ? [{ href: "/pending-approval", label: "Pending Approval" }]
    : (ROLE_NAV[profile.role as UserRole] ?? []);

  useEffect(() => {
    if (!restrictedCustomer) return;
    if (pathname !== "/pending-approval" && !pathname.startsWith("/profile")) {
      router.replace("/pending-approval");
    }
  }, [restrictedCustomer, pathname, router]);

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="app-shell drawer lg:drawer-open min-h-screen bg-base-200">
      <input
        id="app-drawer"
        type="checkbox"
        className="drawer-toggle"
        checked={open}
        onChange={(e) => setOpen(e.target.checked)}
      />

      <div className="drawer-content flex min-h-screen flex-col">
        {/* Top bar — brand, utilities, account */}
        <header className="app-shell-topbar sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-base-300 bg-base-100/95 px-3 py-2 backdrop-blur sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <label
              htmlFor="app-drawer"
              className="btn btn-square btn-ghost lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </label>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">ServiceSync MSP</p>
              <p className="hidden truncate text-xs opacity-60 sm:block">
                From service agreement to support, billing, and collection.
              </p>
            </div>
          </div>

          <div className="order-3 flex w-full justify-center md:order-none md:w-auto md:flex-1">
            <DemoRoleSwitcher currentRole={profile.role as UserRole} />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden text-right lg:block">
              <p className="text-sm font-medium">{profile.full_name}</p>
              <p className="text-xs opacity-60">
                {statusLabel(profile.role)} · {profile.email}
              </p>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={logout} title="Log out">
              <LogOut className="h-4 w-4" />
              <span className="hidden md:inline">Log out</span>
            </button>
          </div>
        </header>

        {/* Main content region — pages supply header + body via PageLayout */}
        <main className="app-shell-main flex-1 px-3 py-4 sm:px-4 md:px-6 md:py-6">{children}</main>
      </div>

      {/* Side navigation — desktop persistent, mobile drawer */}
      <div className="drawer-side z-40">
        <label htmlFor="app-drawer" className="drawer-overlay" onClick={() => setOpen(false)} />
        <aside className="app-shell-nav flex min-h-full w-72 flex-col border-r border-base-300 bg-base-100 text-base-content">
          <div className="border-b border-base-300 p-4">
            <p className="text-lg font-semibold">ServiceSync MSP</p>
            <p className="text-xs opacity-60">Contract-to-cash workspace</p>
            <div className="mt-3">
              <span className="badge badge-primary badge-outline">{statusLabel(profile.role)}</span>
            </div>
          </div>
          <nav className="menu flex-1 gap-1 p-3" aria-label="Main">
            {nav.map((item) => {
              const active =
                !item.disabled &&
                (pathname === item.href || pathname.startsWith(item.href + "/"));
              return (
                <li key={`${item.label}-${item.href}`}>
                  {item.disabled ? (
                    <span className="menu-disabled opacity-40" aria-disabled="true">
                      {item.label}
                    </span>
                  ) : (
                    <Link
                      href={item.href}
                      className={active ? "active" : ""}
                      onClick={() => setOpen(false)}
                    >
                      {item.label}
                    </Link>
                  )}
                </li>
              );
            })}
          </nav>
          <div className="border-t border-base-300 p-4 text-xs opacity-70">
            Use the Demo Role Switcher to change perspectives. A password is required for each role.
            Log out still ends the session completely.
          </div>
        </aside>
      </div>
    </div>
  );
}
