"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, LogOut, Menu, X } from "lucide-react";
import { ThemeSelector } from "@/components/ThemeSelector";
import { DemoRoleSwitcher } from "@/components/DemoRoleSwitcher";
import { BillingStaffNavTree } from "@/components/BillingStaffNavTree";
import { ContractsAgreementsNavTree } from "@/components/ContractsAgreementsNavTree";
import { CustomerBillingNavTree } from "@/components/CustomerBillingNavTree";
import { ROLE_NAV, isManagerRole, type Profile, type UserRole } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { statusLabel } from "@/lib/format";
import type { CustomerStatus } from "@/lib/types";
import { Fragment, useEffect, useState } from "react";

function profileInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function ProfileAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const sizeClass = size === "lg" ? "h-12 w-12 text-base" : size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-primary text-primary-content font-semibold ${sizeClass}`}
      aria-hidden
    >
      {profileInitials(name)}
    </span>
  );
}

function SideNav({
  profile,
  pathname,
  onNavigate,
  showSettings,
  onOpenSettings,
  restrictedCustomer = false,
}: {
  profile: Profile;
  pathname: string;
  onNavigate?: () => void;
  showSettings?: boolean;
  onOpenSettings?: () => void;
  restrictedCustomer?: boolean;
}) {
  const nav = restrictedCustomer
    ? [{ href: "/pending-approval", label: "Pending Approval" }]
    : (ROLE_NAV[profile.role as UserRole] ?? []);
  const isCustomer = profile.role === "customer";
  const isBilling = profile.role === "billing";
  const isManager = isManagerRole(profile.role);
  const isTechnician = profile.role === "technician";

  return (
    <>
      <div className="border-b border-base-300 p-4">
        <p className="text-lg font-semibold">ServiceSync MSP</p>
        <p className="text-xs opacity-60">Contract-to-cash workspace</p>
        <div className="mt-3">
          <span className="badge badge-primary badge-outline">{statusLabel(profile.role)}</span>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3" aria-label="Main">
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Fragment key={item.href}>
              <Link
                href={item.href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active ? "bg-primary text-primary-content" : "hover:bg-base-200"
                }`}
                onClick={onNavigate}
              >
                {item.label}
              </Link>
              {isCustomer && item.href === "/my-contracts" ? (
                <CustomerBillingNavTree onNavigate={onNavigate} />
              ) : null}
              {isManager && item.href === "/customers" ? (
                <ContractsAgreementsNavTree
                  showReports
                  showNewContract
                  showCustomerContractData
                  onNavigate={onNavigate}
                />
              ) : null}
              {isTechnician && item.href === "/dashboard" ? (
                <ContractsAgreementsNavTree showReports={false} onNavigate={onNavigate} />
              ) : null}
              {isBilling && item.href === "/dashboard" ? (
                <>
                  <ContractsAgreementsNavTree showReports onNavigate={onNavigate} />
                  <BillingStaffNavTree onNavigate={onNavigate} />
                </>
              ) : null}
            </Fragment>
          );
        })}
      </nav>
      <div className="space-y-3 border-t border-base-300 p-4">
        {showSettings && onOpenSettings ? (
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-base-200"
            onClick={onOpenSettings}
            aria-label={`Open user settings for ${profile.full_name}`}
          >
            <ProfileAvatar name={profile.full_name} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{profile.full_name}</span>
              <span className="block truncate text-xs opacity-60">{statusLabel(profile.role)}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 opacity-50" />
          </button>
        ) : null}
        <p className="text-xs opacity-70">
          Use the Demo Role Switcher to change perspectives. A password is required for each role. Log out still ends
          the session completely.
        </p>
      </div>
    </>
  );
}

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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  const restrictedCustomer =
    profile.role === "customer" &&
    (customerStatus === "pending_approval" || customerStatus === "rejected");

  useEffect(() => {
    if (!restrictedCustomer) return;
    if (pathname !== "/pending-approval" && !pathname.startsWith("/profile")) {
      router.replace("/pending-approval");
    }
  }, [restrictedCustomer, pathname, router]);

  useEffect(() => {
    setMobileOpen(false);
    setSettingsOpen(false);
    setAppearanceOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!settingsOpen) setAppearanceOpen(false);
  }, [settingsOpen]);

  useEffect(() => {
    if (!settingsOpen && !mobileOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSettingsOpen(false);
        setMobileOpen(false);
      }
    }

    document.body.style.overflow = settingsOpen || mobileOpen ? "hidden" : "";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [settingsOpen, mobileOpen]);

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen bg-base-200">
      {/* Desktop sidebar — always visible and clickable */}
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r border-base-300 bg-base-100 lg:flex">
        <SideNav
          profile={profile}
          pathname={pathname}
          restrictedCustomer={restrictedCustomer}
          showSettings
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-base-300 bg-base-100 px-4 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="btn btn-square btn-ghost lg:hidden"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <p className="text-sm font-semibold leading-tight">ServiceSync MSP</p>
              <p className="hidden text-xs opacity-60 sm:block">
                From service agreement to support, billing, and collection.
              </p>
            </div>
          </div>
          <div className="order-3 flex w-full justify-center md:order-none md:w-auto md:flex-1">
            <DemoRoleSwitcher currentRole={profile.role as UserRole} />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-base-200"
              onClick={() => setSettingsOpen(true)}
              aria-label={`Open user settings for ${profile.full_name}`}
            >
              <ProfileAvatar name={profile.full_name} size="sm" />
              <span className="hidden text-left lg:block">
                <span className="block text-sm font-medium">{profile.full_name}</span>
                <span className="block text-xs opacity-60">{statusLabel(profile.role)}</span>
              </span>
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-base-100 shadow-xl">
            <div className="flex items-center justify-end border-b border-base-300 p-2">
              <button
                type="button"
                className="btn btn-square btn-ghost btn-sm"
                aria-label="Close navigation"
                onClick={() => setMobileOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <SideNav
              profile={profile}
              pathname={pathname}
              restrictedCustomer={restrictedCustomer}
              onNavigate={() => setMobileOpen(false)}
              showSettings
              onOpenSettings={() => {
                setMobileOpen(false);
                setSettingsOpen(true);
              }}
            />
          </aside>
        </div>
      ) : null}

      {/* User settings panel */}
      {settingsOpen ? (
        <div className="fixed inset-0 z-[60]">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close user settings"
            onClick={() => setSettingsOpen(false)}
          />
          <aside className="absolute right-0 top-0 flex h-full w-80 max-w-[85vw] flex-col bg-base-100 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-base-300 p-4">
              <div>
                <h2 className="text-base font-semibold">User settings</h2>
                <p className="text-sm opacity-70">Account and appearance options.</p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-square btn-sm"
                aria-label="Close user settings"
                onClick={() => setSettingsOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
              <section className="flex items-center gap-3">
                <ProfileAvatar name={profile.full_name} size="lg" />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{profile.full_name}</p>
                  <p className="truncate text-sm opacity-70">{profile.email}</p>
                  <p className="mt-1">
                    <span className="badge badge-primary badge-outline badge-sm">
                      {statusLabel(profile.role)}
                    </span>
                  </p>
                </div>
              </section>
              <section className="space-y-2">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-base-200"
                  aria-expanded={appearanceOpen}
                  onClick={() => setAppearanceOpen((value) => !value)}
                >
                  <span>Appearance</span>
                  {appearanceOpen ? (
                    <ChevronDown className="h-4 w-4 opacity-70" />
                  ) : (
                    <ChevronRight className="h-4 w-4 opacity-70" />
                  )}
                </button>
                {appearanceOpen ? (
                  <div className="px-1">
                    <ThemeSelector />
                  </div>
                ) : null}
              </section>
            </div>
            <div className="border-t border-base-300 p-4">
              <button type="button" className="btn btn-outline btn-block" onClick={logout}>
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
