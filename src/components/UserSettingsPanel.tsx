"use client";

import { useState } from "react";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  LogOut,
  Palette,
  User,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { ThemeSelector } from "@/components/ThemeSelector";
import { createClient } from "@/lib/supabase/client";
import { statusLabel } from "@/lib/format";
import type { Profile, UserRole } from "@/lib/constants";
import {
  NOTIFICATION_OPTIONS,
  applyPreferencesToDom,
  loadPreferences,
  savePreferences,
  type UserPreferences,
} from "@/lib/user-preferences";

type PaneId = "root" | "account" | "appearance" | "notifications" | "exports" | "billingContact";

type Section = {
  id: Exclude<PaneId, "root">;
  icon: LucideIcon;
  title: string;
  subtitle: string;
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="form-control w-full">
      <span className="label-text mb-1 text-sm font-medium">{label}</span>
      {children}
      {hint ? <span className="mt-1 text-xs opacity-60">{hint}</span> : null}
    </label>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-box border border-base-300 px-3 py-2">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs opacity-60">{description}</span>
      </span>
      <input
        type="checkbox"
        className="toggle toggle-primary toggle-sm mt-1 shrink-0"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-base-300 py-2 last:border-b-0">
      <span className="text-sm opacity-60">{label}</span>
      <span className="truncate text-sm font-medium">{value}</span>
    </div>
  );
}

export function UserSettingsPanel({
  profile,
  onClose,
  onLogout,
}: {
  profile: Profile;
  onClose: () => void;
  onLogout: () => void;
}) {
  const role = profile.role as UserRole;
  const isCustomer = role === "customer";
  const isStaff = role === "manager" || role === "billing";

  const [pane, setPane] = useState<PaneId>("root");
  const [preferences, setPreferences] = useState<UserPreferences>(() => loadPreferences());

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  function update(patch: Partial<UserPreferences>) {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    savePreferences(next);
    applyPreferencesToDom(next);
  }

  async function changePassword() {
    if (password.length < 4) {
      setPasswordMessage({ tone: "error", text: "Use at least 4 characters." });
      return;
    }
    if (password !== confirmPassword) {
      setPasswordMessage({ tone: "error", text: "Passwords do not match." });
      return;
    }

    setPasswordBusy(true);
    setPasswordMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setPasswordBusy(false);

    if (error) {
      setPasswordMessage({ tone: "error", text: error.message });
      return;
    }
    setPassword("");
    setConfirmPassword("");
    setPasswordMessage({ tone: "success", text: "Password updated." });
  }

  const sections: Section[] = [
    { id: "account", icon: User, title: "Account", subtitle: "Name, email, role, and password" },
    { id: "appearance", icon: Palette, title: "Appearance", subtitle: "Light or dark theme" },
    { id: "notifications", icon: Bell, title: "Notifications", subtitle: "Choose which alerts you receive" },
    ...(isStaff
      ? [{ id: "exports" as const, icon: Download, title: "Data & exports", subtitle: "CSV export defaults" }]
      : []),
    ...(isCustomer
      ? [
          {
            id: "billingContact" as const,
            icon: CreditCard,
            title: "Billing & payments",
            subtitle: "Statement contact and payment default",
          },
        ]
      : []),
  ];

  const activeSection = sections.find((section) => section.id === pane);
  const notifications = NOTIFICATION_OPTIONS.filter((option) => option.roles.includes(role));

  return (
    <div className="fixed inset-0 z-[60]">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Close user settings"
        onClick={onClose}
      />
      <aside className="absolute right-0 top-0 flex h-full w-96 max-w-[90vw] flex-col bg-base-100 shadow-2xl">
        <div className="flex items-center gap-2 border-b border-base-300 p-4">
          {pane === "root" ? null : (
            <button
              type="button"
              className="btn btn-ghost btn-square btn-sm"
              aria-label="Back to user settings"
              onClick={() => setPane("root")}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold">
            {activeSection ? activeSection.title : "User settings"}
          </h2>
          <button
            type="button"
            className="btn btn-ghost btn-square btn-sm"
            aria-label="Close user settings"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {pane === "root" ? (
            <div className="space-y-4">
              <section className="flex items-center gap-3 rounded-box border border-base-300 p-3">
                <ProfileAvatar name={profile.full_name} size="lg" />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{profile.full_name}</p>
                  <p className="truncate text-sm opacity-70">{profile.email}</p>
                  <p className="mt-1">
                    <span className="badge badge-primary badge-outline badge-sm">
                      {statusLabel(role)}
                    </span>
                  </p>
                </div>
              </section>

              <nav className="space-y-1" aria-label="Settings sections">
                {sections.map((section) => {
                  const Icon = section.icon;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-base-200"
                      onClick={() => setPane(section.id)}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-base-200">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{section.title}</span>
                        <span className="block truncate text-xs opacity-60">{section.subtitle}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 opacity-50" />
                    </button>
                  );
                })}
              </nav>
            </div>
          ) : null}

          {pane === "account" ? (
            <div className="space-y-5">
              <section className="rounded-box border border-base-300 px-3 py-1">
                <ReadOnlyRow label="Name" value={profile.full_name} />
                <ReadOnlyRow label="Email" value={profile.email} />
                <ReadOnlyRow label="Role" value={statusLabel(role)} />
              </section>
              <p className="text-xs opacity-60">
                Name, email, and role are managed by your administrator.
              </p>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Change password</h3>
                <Field label="New password">
                  <input
                    type="password"
                    className="input input-bordered input-sm w-full"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </Field>
                <Field label="Confirm new password">
                  <input
                    type="password"
                    className="input input-bordered input-sm w-full"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </Field>
                {passwordMessage ? (
                  <div
                    className={`alert alert-sm ${
                      passwordMessage.tone === "success" ? "alert-success" : "alert-error"
                    }`}
                  >
                    <span className="text-sm">{passwordMessage.text}</span>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={passwordBusy || !password}
                  onClick={changePassword}
                >
                  {passwordBusy ? "Updating..." : "Update password"}
                </button>
              </section>
            </div>
          ) : null}

          {pane === "appearance" ? (
            <div className="space-y-4">
              <ThemeSelector />
            </div>
          ) : null}

          {pane === "notifications" ? (
            <div className="space-y-3">
              <p className="text-xs opacity-60">
                Choose which events should reach you. Preferences are saved on this device.
              </p>
              {notifications.map((option) => (
                <ToggleRow
                  key={option.key}
                  label={option.label}
                  description={option.description}
                  checked={preferences.notifications[option.key]}
                  onChange={(value) =>
                    update({ notifications: { ...preferences.notifications, [option.key]: value } })
                  }
                />
              ))}
            </div>
          ) : null}

          {pane === "exports" ? (
            <div className="space-y-4">
              <p className="text-xs opacity-60">
                Defaults used by CSV exports on Accounts Receivable and Payment History.
              </p>
              <ToggleRow
                label="Include column headers"
                description="Write a header row at the top of each export."
                checked={preferences.csvIncludeHeaders}
                onChange={(value) => update({ csvIncludeHeaders: value })}
              />
              <Field label="Delimiter">
                <select
                  className="select select-bordered select-sm w-full"
                  value={preferences.csvDelimiter}
                  onChange={(e) =>
                    update({ csvDelimiter: e.target.value as UserPreferences["csvDelimiter"] })
                  }
                >
                  <option value="comma">Comma (,)</option>
                  <option value="semicolon">Semicolon (;)</option>
                  <option value="tab">Tab</option>
                </select>
              </Field>
            </div>
          ) : null}

          {pane === "billingContact" ? (
            <div className="space-y-4">
              <Field label="Billing contact email" hint="Where invoices and statements are sent.">
                <input
                  type="email"
                  className="input input-bordered input-sm w-full"
                  placeholder={profile.email}
                  value={preferences.billingContactEmail}
                  onChange={(e) => update({ billingContactEmail: e.target.value })}
                />
              </Field>
              <Field label="Default payment method" hint="Pre-selected on the Make a Payment screen.">
                <select
                  className="select select-bordered select-sm w-full"
                  value={preferences.defaultPaymentMethod}
                  onChange={(e) => update({ defaultPaymentMethod: e.target.value })}
                >
                  <option value="ach">ACH transfer</option>
                  <option value="credit_card">Credit card</option>
                  <option value="check">Check</option>
                  <option value="wire">Wire transfer</option>
                </select>
              </Field>
            </div>
          ) : null}
        </div>

        <div className="border-t border-base-300 p-4">
          <button type="button" className="btn btn-outline btn-block" onClick={onLogout}>
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </aside>
    </div>
  );
}
