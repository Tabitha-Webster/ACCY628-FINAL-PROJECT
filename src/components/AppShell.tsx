"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight, PanelLeft, PanelLeftClose } from "lucide-react";
import { DemoRoleSwitcher } from "@/components/DemoRoleSwitcher";
import { BillingStaffNavTree } from "@/components/BillingStaffNavTree";
import { ContractsAgreementsNavTree } from "@/components/ContractsAgreementsNavTree";
import { CustomerBillingNavTree } from "@/components/CustomerBillingNavTree";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { UserSettingsPanel } from "@/components/UserSettingsPanel";
import { isManagerRole, ROLE_NAV, roleHomePath, type Profile, type UserRole } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { statusLabel } from "@/lib/format";
import { applyPreferencesToDom, loadPreferences } from "@/lib/user-preferences";
import type { CustomerStatus } from "@/lib/types";
import { Fragment, useEffect, useState } from "react";

const SIDEBAR_COLLAPSED_KEY = "servicesync-sidebar-collapsed";

function SideNav({
  profile,
  pathname,
  onNavigate,
  showSettings,
  onOpenSettings,
  onCollapse,
  restrictedCustomer = false,
}: {
  profile: Profile;
  pathname: string;
  onNavigate?: () => void;
  showSettings?: boolean;
  onOpenSettings?: () => void;
  onCollapse?: () => void;
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
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Link
              href={restrictedCustomer ? "/pending-approval" : roleHomePath(profile.role as UserRole)}
              className="block outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              onClick={onNavigate}
              aria-label="ServiceSync MSP home"
            >
              <Image
                src="/images/servicesync-msp-logo.png?v=5"
                alt="ServiceSync MSP"
                width={1160}
                height={700}
                className="sidebar-brand-logo h-auto w-full max-w-[11.5rem] object-contain object-left"
                sizes="184px"
                priority
                unoptimized
              />
            </Link>
            <p className="mt-2 text-xs opacity-60">Contract-to-cash workspace</p>
          </div>
          {onCollapse ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-square shrink-0"
              onClick={onCollapse}
              aria-label="Collapse side menu"
              title="Collapse side menu"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          ) : null}
        </div>
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
      {showSettings && onOpenSettings ? (
        <div className="border-t border-base-300 p-4">
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
        </div>
      ) : null}
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPathname, setSettingsPathname] = useState(pathname);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarReady, setSidebarReady] = useState(false);

  // Dismiss the settings panel when the route changes.
  if (settingsPathname !== pathname) {
    setSettingsPathname(pathname);
    setSettingsOpen(false);
  }

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
    applyPreferencesToDom(loadPreferences());
  }, []);

  useEffect(() => {
    try {
      setSidebarCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
    } catch {
      setSidebarCollapsed(false);
    }
    setSidebarReady(true);
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSettingsOpen(false);
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [settingsOpen]);

  function setCollapsed(next: boolean) {
    setSidebarCollapsed(next);
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // Ignore storage failures in private browsing.
    }
  }

  const showSidebar = !sidebarReady || !sidebarCollapsed;

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen bg-base-100">
      <aside
        className={`app-sidebar sticky top-0 flex h-screen shrink-0 flex-col border-r border-base-300 overflow-hidden transition-[width] duration-200 ease-out ${
          showSidebar ? "w-72" : "w-0 border-transparent"
        }`}
        aria-hidden={!showSidebar}
      >
        <div className={`flex h-full w-72 flex-col ${showSidebar ? "" : "pointer-events-none"}`}>
          <SideNav
            profile={profile}
            pathname={pathname}
            restrictedCustomer={restrictedCustomer}
            showSettings
            onOpenSettings={() => setSettingsOpen(true)}
            onCollapse={() => setCollapsed(true)}
          />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-base-300 bg-base-100 px-4 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-square"
              onClick={() => setCollapsed(showSidebar)}
              aria-label={showSidebar ? "Collapse side menu" : "Expand side menu"}
              aria-expanded={showSidebar}
              title={showSidebar ? "Collapse side menu" : "Expand side menu"}
            >
              {showSidebar ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
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
        <main className="app-main flex-1 p-5 md:p-8">{children}</main>
      </div>

      {settingsOpen ? (
        <UserSettingsPanel profile={profile} onClose={() => setSettingsOpen(false)} onLogout={logout} />
      ) : null}
    </div>
  );
}
