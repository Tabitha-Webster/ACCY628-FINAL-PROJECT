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

export function AppShell({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"menu" | "settings">("menu");
  const nav = ROLE_NAV[profile.role as UserRole] ?? [];

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function openMenu() {
    setDrawerTab("menu");
    setOpen(true);
  }

  function closeMenu() {
    setOpen(false);
    setDrawerTab("menu");
  }

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setDrawerTab("menu");
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="min-h-screen bg-base-200">
      <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-base-300 bg-base-100 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" className="btn btn-square btn-ghost" aria-label="Open menu" onClick={openMenu}>
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

      <main className="p-4 md:p-6">{children}</main>

      {open ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close menu"
            onClick={closeMenu}
          />
          <aside className="absolute left-0 top-0 flex h-full w-80 max-w-[85vw] flex-col bg-base-100 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-base-300 p-4">
              <div>
                <p className="text-lg font-semibold">ServiceSync MSP</p>
                <p className="text-xs opacity-60">Contract-to-cash workspace</p>
                <div className="mt-3">
                  <span className="badge badge-primary badge-outline">{statusLabel(profile.role)}</span>
                </div>
              </div>
              <button type="button" className="btn btn-ghost btn-square btn-sm" aria-label="Close menu" onClick={closeMenu}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div role="tablist" className="tabs tabs-box m-3">
              <button
                type="button"
                role="tab"
                className={`tab ${drawerTab === "menu" ? "tab-active" : ""}`}
                onClick={() => setDrawerTab("menu")}
              >
                Menu
              </button>
              <button
                type="button"
                role="tab"
                className={`tab ${drawerTab === "settings" ? "tab-active" : ""}`}
                onClick={() => setDrawerTab("settings")}
              >
                <Settings2 className="mr-1 h-3.5 w-3.5" />
                Settings
              </button>
            </div>

            {drawerTab === "menu" ? (
              <>
                <nav className="menu min-h-0 flex-1 overflow-y-auto px-3 pb-3">
                  {nav.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    return (
                      <li key={item.href}>
                        <Link href={item.href} className={active ? "active" : ""} onClick={closeMenu}>
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </nav>
                <div className="border-t border-base-300 p-4 text-xs opacity-70">
                  Use the Demo Role Switcher to change perspectives. A password is required for each role. Log out still
                  ends the session completely.
                </div>
              </>
            ) : (
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
                <div>
                  <h2 className="text-base font-semibold">Settings</h2>
                  <p className="text-sm opacity-70">Appearance options for this workspace.</p>
                </div>
                <ThemeSelector />
              </div>
            )}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
