"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu } from "lucide-react";
import { DemoRoleSwitcher } from "@/components/DemoRoleSwitcher";
import { ROLE_NAV, type Profile, type UserRole } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { statusLabel } from "@/lib/format";
import { useState } from "react";

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
  const nav = ROLE_NAV[profile.role as UserRole];

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="drawer lg:drawer-open min-h-screen bg-base-200">
      <input
        id="app-drawer"
        type="checkbox"
        className="drawer-toggle"
        checked={open}
        onChange={(e) => setOpen(e.target.checked)}
      />
      <div className="drawer-content flex flex-col">
        <header className="navbar border-b border-base-300 bg-base-100 px-4">
          <div className="flex-none lg:hidden">
            <label htmlFor="app-drawer" className="btn btn-square btn-ghost" onClick={() => setOpen(true)}>
              <Menu className="h-5 w-5" />
            </label>
          </div>
          <div className="navbar-start min-w-0 flex-1">
            <div>
              <p className="text-sm font-semibold leading-tight">ServiceSync MSP</p>
              <p className="hidden text-xs opacity-60 sm:block">
                From service agreement to support, billing, and collection.
              </p>
            </div>
          </div>
          <div className="navbar-center hidden px-2 md:flex">
            <DemoRoleSwitcher currentRole={profile.role as UserRole} />
          </div>
          <div className="navbar-end flex min-w-0 flex-1 items-center justify-end gap-2">
            <div className="md:hidden">
              <DemoRoleSwitcher currentRole={profile.role as UserRole} />
            </div>
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

      <div className="drawer-side z-40">
        <label htmlFor="app-drawer" className="drawer-overlay" onClick={() => setOpen(false)} />
        <aside className="flex min-h-full w-72 flex-col bg-base-100 text-base-content">
          <div className="border-b border-base-300 p-4">
            <p className="text-lg font-semibold">ServiceSync MSP</p>
            <p className="text-xs opacity-60">Contract-to-cash workspace</p>
            <div className="mt-3">
              <span className="badge badge-primary badge-outline">{statusLabel(profile.role)}</span>
            </div>
          </div>
          <nav className="menu flex-1 p-3">
            {nav.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={active ? "active" : ""}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </nav>
          <div className="border-t border-base-300 p-4 text-xs opacity-70">
            Use the Demo Role Switcher in the top bar to change perspectives. Log out still ends the session completely.
          </div>
        </aside>
      </div>
    </div>
  );
}
