"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight, PanelLeft, PanelLeftClose } from "lucide-react";
import { DemoRoleSwitcher } from "@/components/DemoRoleSwitcher";
import { BillingStaffNavTree } from "@/components/BillingStaffNavTree";
import { CompanyDirectoryNavTree } from "@/components/CompanyDirectoryNavTree";
import { AdminApprovalsNavTree } from "@/components/AdminApprovalsNavTree";
import { ContractsAgreementsNavTree } from "@/components/ContractsAgreementsNavTree";
import { SystemNavTree } from "@/components/SystemNavTree";
import { UserAccessNavTree } from "@/components/UserAccessNavTree";
import { HeaderPageSearch } from "@/components/HeaderPageSearch";
import { HelpChatBubble } from "@/components/HelpChatBubble";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { UserSettingsPanel } from "@/components/UserSettingsPanel";
import { isManagerRole, ROLE_NAV, roleHomePath, type Profile, type UserRole } from "@/lib/constants";
import { hrefAllowedByPageKeys } from "@/lib/role-permissions";
import { createClient } from "@/lib/supabase/client";
import { statusLabel } from "@/lib/format";
import { applyPreferencesToDom, loadPreferences } from "@/lib/user-preferences";
import type { CustomerStatus } from "@/lib/types";
import { Fragment, useEffect, useId, useState } from "react";

const SIDEBAR_COLLAPSED_KEY = "servicesync-sidebar-collapsed-v2";

function SideNav({
  profile,
  pathname,
  onNavigate,
  showSettings,
  onOpenSettings,
  restrictedCustomer = false,
  allowedPageKeys = null,
}: {
  profile: Profile;
  pathname: string;
  onNavigate?: () => void;
  showSettings?: boolean;
  onOpenSettings?: () => void;
  restrictedCustomer?: boolean;
  allowedPageKeys?: Set<string> | null;
}) {
  const nav = restrictedCustomer
    ? [{ href: "/pending-approval", label: "Pending Approval" }]
    : (ROLE_NAV[profile.role as UserRole] ?? []);
  const isBilling = profile.role === "billing";
  const isManager = isManagerRole(profile.role);
  const isTechnician = profile.role === "technician";
  const isAdmin = profile.role === "admin";
  const isExecutive = profile.role === "executive";
  const homeHref = restrictedCustomer ? "/pending-approval" : roleHomePath(profile.role as UserRole);

  function canShowHref(href: string) {
    if (isAdmin) return true;
    return hrefAllowedByPageKeys(href, allowedPageKeys);
  }

  return (
    <>
      <div className="border-b border-base-300 p-4">
        <Link
          href={homeHref}
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
        <p className="mt-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] opacity-55">
          Contract-to-cash workspace
        </p>
        <div className="mt-3">
          <span className="badge badge-primary badge-outline">{statusLabel(profile.role)}</span>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3" aria-label="Main">
        {nav.map((item) => {
          if (!restrictedCustomer && !canShowHref(item.href)) return null;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Fragment key={item.href}>
              <Link
                href={item.href}
                className={`rounded-lg px-3 py-2 text-[0.8125rem] font-medium tracking-[-0.01em] transition-colors ${
                  active ? "bg-primary text-primary-content" : "hover:bg-base-200"
                }`}
                onClick={onNavigate}
              >
                {item.label}
              </Link>
              {!restrictedCustomer && isAdmin && item.href === "/admin" ? (
                <>
                  <UserAccessNavTree onNavigate={onNavigate} />
                  <CompanyDirectoryNavTree
                    onNavigate={onNavigate}
                    allowedPageKeys={allowedPageKeys}
                  />
                  <AdminApprovalsNavTree onNavigate={onNavigate} />
                  <SystemNavTree onNavigate={onNavigate} />
                </>
              ) : null}
              {!restrictedCustomer && isManager && !isAdmin && item.href === "/customers" ? (
                <ContractsAgreementsNavTree
                  showReports
                  showNewContract
                  showCustomerContractData
                  showViewEditContracts
                  onNavigate={onNavigate}
                  allowedPageKeys={allowedPageKeys}
                />
              ) : null}
              {!restrictedCustomer && isExecutive && item.href === "/customers" ? (
                <ContractsAgreementsNavTree
                  showReports
                  showNewContract={false}
                  showCustomerContractData={false}
                  showAwaitingSignature
                  showRenewals={false}
                  onNavigate={onNavigate}
                  allowedPageKeys={allowedPageKeys}
                />
              ) : null}
              {isTechnician && item.href === "/dashboard" ? (
                <ContractsAgreementsNavTree
                  showReports={false}
                  onNavigate={onNavigate}
                  allowedPageKeys={allowedPageKeys}
                />
              ) : null}
              {isBilling && item.href === "/dashboard" ? (
                <>
                  <ContractsAgreementsNavTree
                    showReports
                    onNavigate={onNavigate}
                    allowedPageKeys={allowedPageKeys}
                  />
                  <BillingStaffNavTree onNavigate={onNavigate} allowedPageKeys={allowedPageKeys} />
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
              <span className="block truncate text-sm font-semibold tracking-tight">{profile.full_name}</span>
              <span className="block truncate text-[0.65rem] font-semibold uppercase tracking-[0.1em] opacity-55">
                {statusLabel(profile.role)}
              </span>
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
  allowedPageKeys = null,
  children,
}: {
  profile: Profile;
  customerStatus?: CustomerStatus | null;
  allowedPageKeys?: string[] | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const sidebarId = useId();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPathname, setSettingsPathname] = useState(pathname);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const allowedSet = allowedPageKeys == null ? null : new Set(allowedPageKeys);

  if (settingsPathname !== pathname) {
    setSettingsPathname(pathname);
    setSettingsOpen(false);
  }

  const restrictedCustomer =
    profile.role === "customer" && customerStatus !== "active";

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
    setPrefsLoaded(true);
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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "b") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      event.preventDefault();
      setSidebarCollapsed((current) => {
        const next = !current;
        try {
          window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
        } catch {
          // Ignore storage failures in private browsing.
        }
        return next;
      });
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function persistCollapsed(next: boolean) {
    setSidebarCollapsed(next);
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // Ignore storage failures in private browsing.
    }
  }

  const collapsed = prefsLoaded && sidebarCollapsed;

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex h-screen overflow-hidden bg-base-100">
      <div
        className={`relative sticky top-0 z-30 h-screen shrink-0 transition-[width] duration-200 ease-out ${
          collapsed ? "w-0" : "w-72"
        } ${prefsLoaded ? "" : "transition-none"}`}
      >
        {!collapsed ? (
          <aside
            id={sidebarId}
            className="app-sidebar flex h-full w-72 flex-col border-r border-base-300 shadow-[8px_0_28px_-20px_rgba(0,0,0,0.45)]"
            aria-label="Side menu"
          >
            <SideNav
              profile={profile}
              pathname={pathname}
              restrictedCustomer={restrictedCustomer}
              allowedPageKeys={allowedSet}
              showSettings
              onOpenSettings={() => setSettingsOpen(true)}
            />
          </aside>
        ) : null}

        <button
          type="button"
          className={`app-sidebar-toggle absolute top-4 z-40 flex size-7 items-center justify-center rounded-full border border-base-300 bg-base-100 text-base-content shadow-sm transition hover:border-primary/50 hover:bg-base-200 ${
            collapsed ? "left-3" : "-right-3"
          }`}
          onClick={() => persistCollapsed(!collapsed)}
          aria-controls={collapsed ? undefined : sidebarId}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand side menu" : "Collapse side menu"}
          title={collapsed ? "Expand side menu (Ctrl+B)" : "Collapse side menu (Ctrl+B)"}
        >
          {collapsed ? <PanelLeft className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="app-topbar flex shrink-0 flex-wrap items-center gap-3 border-b border-base-300 px-5 py-2.5 md:px-8">
          <div className={`flex min-w-0 items-center gap-2 ${collapsed ? "pl-10" : "pl-1"}`}>
            {collapsed ? (
              <div className="flex min-w-0 max-w-[14rem] items-center sm:max-w-[17rem] md:max-w-[20rem]">
                <Image
                  src="/images/servicesync-msp-logo.png?v=5"
                  alt="ServiceSync MSP"
                  width={1160}
                  height={700}
                  className="header-brand-logo h-12 w-auto max-w-full object-contain object-left sm:h-14"
                  sizes="(max-width: 640px) 180px, 240px"
                  priority
                  unoptimized
                />
              </div>
            ) : null}
          </div>
          <div className="order-3 flex w-full justify-center md:order-none md:w-auto md:flex-1">
            <DemoRoleSwitcher currentRole={profile.role as UserRole} />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <HeaderPageSearch
              role={profile.role as UserRole}
              allowedPageKeys={allowedSet}
              restrictedCustomer={restrictedCustomer}
            />
            <button
              type="button"
              className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 transition-colors hover:bg-base-200"
              onClick={() => setSettingsOpen(true)}
              aria-label={`Open user settings for ${profile.full_name}`}
            >
              <ProfileAvatar name={profile.full_name} size="sm" />
              <span className="hidden text-left lg:block">
                <span className="block text-sm font-semibold tracking-tight">{profile.full_name}</span>
                <span className="block text-[0.7rem] font-medium uppercase tracking-[0.08em] opacity-55">
                  {statusLabel(profile.role)}
                </span>
              </span>
            </button>
          </div>
        </header>
        <main className="app-main min-h-0 flex-1 overflow-auto px-5 py-6 md:px-8 md:py-8">{children}</main>
      </div>

      {settingsOpen ? (
        <UserSettingsPanel profile={profile} onClose={() => setSettingsOpen(false)} onLogout={logout} />
      ) : null}

      {!restrictedCustomer ? <HelpChatBubble /> : null}
    </div>
  );
}
