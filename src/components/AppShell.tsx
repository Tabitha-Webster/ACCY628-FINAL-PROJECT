"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight, Menu } from "lucide-react";
import { DemoRoleSwitcher } from "@/components/DemoRoleSwitcher";
import { BillingStaffNavTree } from "@/components/BillingStaffNavTree";
import { ContractsAgreementsNavTree } from "@/components/ContractsAgreementsNavTree";
import { CustomerBillingNavTree } from "@/components/CustomerBillingNavTree";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { UserSettingsPanel } from "@/components/UserSettingsPanel";
import { ROLE_NAV, type Profile, type UserRole } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { statusLabel } from "@/lib/format";
import { applyPreferencesToDom, loadPreferences } from "@/lib/user-preferences";
import { Fragment, useEffect, useState } from "react";

function SideNav({
  profile,
  pathname,
  onNavigate,
  showSettings,
  onOpenSettings,
}: {
  profile: Profile;
  pathname: string;
  onNavigate?: () => void;
  showSettings?: boolean;
  onOpenSettings?: () => void;
}) {
  const nav = ROLE_NAV[profile.role as UserRole] ?? [];
  const isCustomer = profile.role === "customer";
  const isBilling = profile.role === "billing";
  const isManager = profile.role === "manager";

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
                <ContractsAgreementsNavTree showReports onNavigate={onNavigate} />
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
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  // null means "follow the breakpoint default"; the sidebar is docked at lg and up.
  const [navOverride, setNavOverride] = useState<"open" | "closed" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPathname, setSettingsPathname] = useState(pathname);

  // Dismiss the settings panel when the route changes.
  if (settingsPathname !== pathname) {
    setSettingsPathname(pathname);
    setSettingsOpen(false);
  }

  useEffect(() => {
    applyPreferencesToDom(loadPreferences());
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

  function isDesktop() {
    return window.matchMedia("(min-width: 1024px)").matches;
  }

  function toggleNav() {
    setNavOverride((prev) => {
      if (prev) return prev === "open" ? "closed" : "open";
      return isDesktop() ? "closed" : "open";
    });
  }

  function handleNavigate() {
    if (!isDesktop()) setNavOverride("closed");
  }

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const navVisibility =
    navOverride === "open" ? "flex" : navOverride === "closed" ? "hidden" : "hidden lg:flex";

  return (
    <div className="flex min-h-screen bg-base-200">
      {/* Docked sidebar — sits in flow, so the rest of the page stays clickable. */}
      <aside
        className={`sticky top-0 h-screen w-72 shrink-0 flex-col border-r border-base-300 bg-base-100 ${navVisibility}`}
      >
        <SideNav
          profile={profile}
          pathname={pathname}
          onNavigate={handleNavigate}
          showSettings
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-base-300 bg-base-100 px-4 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="btn btn-square btn-ghost"
              aria-label="Toggle navigation"
              onClick={toggleNav}
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

      {settingsOpen ? (
        <UserSettingsPanel profile={profile} onClose={() => setSettingsOpen(false)} onLogout={logout} />
      ) : null}
    </div>
  );
}
