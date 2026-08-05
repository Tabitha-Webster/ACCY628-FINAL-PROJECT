"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ASSIGNABLE_ROLES, type UserRole } from "@/lib/constants";

type CustomerOption = { id: string; name: string };

export function AdminCreateUserForm({ customers }: { customers: CustomerOption[] }) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("123456");
  const [role, setRole] = useState<UserRole>("technician");
  const [customerId, setCustomerId] = useState("");
  const [internalCostRate, setInternalCostRate] = useState("65");
  const [isDemoUser, setIsDemoUser] = useState(true);
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
      body: JSON.stringify({
        fullName,
        email,
        password,
        role,
        customerId: role === "customer" ? customerId || null : null,
        isDemoUser,
        internalCostRate: internalCostRate === "" ? null : Number(internalCostRate),
      }),
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
    setCustomerId("");
    setInternalCostRate("65");
    setIsDemoUser(true);
    router.refresh();
  }

  return (
    <div className="rounded-box border border-base-300 bg-base-100 p-4">
      <h2 className="text-sm font-semibold">Create user</h2>
      <p className="mt-1 text-xs opacity-60">
        Creates a Supabase Auth account and profile. Password must be at least 6 characters.
      </p>

      <form className="mt-4 space-y-3" onSubmit={onSubmit}>
        {error ? <div className="alert alert-error text-sm">{error}</div> : null}
        {message ? <div className="alert alert-success text-sm">{message}</div> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="form-control">
            <span className="label-text mb-1">Full name</span>
            <input
              className="input input-bordered"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </label>
          <label className="form-control">
            <span className="label-text mb-1">Email</span>
            <input
              type="email"
              className="input input-bordered"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="form-control">
            <span className="label-text mb-1">Temporary password</span>
            <input
              type="text"
              className="input input-bordered"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </label>
          <label className="form-control">
            <span className="label-text mb-1">Role</span>
            <select
              className="select select-bordered"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
            >
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="form-control">
            <span className="label-text mb-1">Internal cost rate</span>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input input-bordered"
              value={internalCostRate}
              onChange={(e) => setInternalCostRate(e.target.value)}
            />
          </label>
          <label className="form-control">
            <span className="label-text mb-1">Customer link (customer role)</span>
            <select
              className="select select-bordered"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              disabled={role !== "customer"}
              required={role === "customer"}
            >
              <option value="">{role === "customer" ? "Select customer…" : "Not required"}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={isDemoUser}
            onChange={(e) => setIsDemoUser(e.target.checked)}
          />
          Mark as demo user
        </label>

        <button className="btn btn-primary" disabled={loading}>
          {loading ? "Creating…" : "Create user"}
        </button>
      </form>
    </div>
  );
}
