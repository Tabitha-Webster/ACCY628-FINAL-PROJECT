"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, Settings2, X } from "lucide-react";
import { ThemeSelector } from "@/components/ThemeSelector";
import { DemoRoleSwitcher } from "@/components/DemoRoleSwitcher";
import { ROLE_NAV, type Profile, type UserRole } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { statusLabel } from "@/lib/format";
import { useEffect, useState } from "react";

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
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active ? "bg-primary text-primary-content" : "hover:bg-base-200"
              }`}
              onClick={onNavigate}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="space-y-3 border-t border-base-300 p-4">
        {showSettings && onOpenSettings ? (
          <button type="button" className="btn btn-ghost btn-sm w-full justify-start" onClick={onOpenSettings}>
            <Settings2 className="h-4 w-4" />
            Settings
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
    setSettingsOpen(false);
  }, [pathname]);

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
              className="btn btn-ghost btn-sm"
              onClick={() => setSettingsOpen(true)}
              title="Settings"
            >
              <Settings2 className="h-4 w-4" />
              <span className="hidden md:inline">Settings</span>
            </button>
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

      {/* Settings panel from main (theme) */}
      {settingsOpen ? (
        <div className="fixed inset-0 z-[60]">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close settings"
            onClick={() => setSettingsOpen(false)}
          />
          <aside className="absolute right-0 top-0 flex h-full w-80 max-w-[85vw] flex-col bg-base-100 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-base-300 p-4">
              <div>
                <h2 className="text-base font-semibold">Settings</h2>
                <p className="text-sm opacity-70">Appearance options for this workspace.</p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-square btn-sm"
                aria-label="Close settings"
                onClick={() => setSettingsOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <ThemeSelector />
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
