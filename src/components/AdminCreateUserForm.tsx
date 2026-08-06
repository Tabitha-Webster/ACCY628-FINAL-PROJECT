"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ASSIGNABLE_ROLES, roleLabel, type UserRole } from "@/lib/constants";

const FIELD_LABEL = "text-xs font-semibold uppercase tracking-wide opacity-70";

export function AdminCreateUserForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("123456");
  const [role, setRole] = useState<UserRole>("technician");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const res = await fetch("/api/admin/create-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, email, password, role }),
    });

    const data = (await res.json()) as { error?: string; user?: { email: string; role: string } };
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Could not create user.");
      return;
    }

    setMessage(`Created ${data.user?.email ?? email} as ${data.user?.role ?? role}.`);
    setFullName("");
    setEmail("");
    setPassword("123456");
    setRole("technician");
    router.refresh();
  }

  return (
    <div className="rounded-box border border-base-300 bg-base-100 p-4">
      <h2 className="text-sm font-semibold">Create user</h2>
      <p className="mt-1 text-xs opacity-60">
        Creates a login and profile. Password must be at least 6 characters.
      </p>

      <form className="mt-4 space-y-3" onSubmit={onSubmit}>
        {error ? <div className="alert alert-error text-sm">{error}</div> : null}
        {message ? <div className="alert alert-success text-sm">{message}</div> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col items-start gap-1">
            <span className={FIELD_LABEL}>Full name</span>
            <input
              className="input input-bordered w-full"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col items-start gap-1">
            <span className={FIELD_LABEL}>Email</span>
            <input
              type="email"
              className="input input-bordered w-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col items-start gap-1">
            <span className={FIELD_LABEL}>Temporary password</span>
            <input
              type="text"
              className="input input-bordered w-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </label>
          <label className="flex flex-col items-start gap-1">
            <span className={FIELD_LABEL}>Role</span>
            <select
              className="select select-bordered w-full"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
            >
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button className="btn btn-primary" disabled={loading}>
          {loading ? "Creating…" : "Create user"}
        </button>
      </form>
    </div>
  );
}
