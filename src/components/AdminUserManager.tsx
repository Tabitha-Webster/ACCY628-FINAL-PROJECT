"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ASSIGNABLE_ROLES, type UserRole } from "@/lib/constants";
import { StatusBadge } from "@/components/ui";
import { CsvExportButton } from "@/components/CsvExportButton";

export type AdminUserRow = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  customer_id: string | null;
  internal_cost_rate: number | null;
  is_demo_user: boolean;
  is_active: boolean;
};

type CustomerOption = { id: string; name: string };

type Props = {
  users: AdminUserRow[];
  customers: CustomerOption[];
  currentUserId: string;
};

export function AdminUserManager({ users, customers, currentUserId }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(users);
  const [filter, setFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRole, setBulkRole] = useState<UserRole>("technician");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const customerName = useMemo(
    () => new Map(customers.map((c) => [c.id, c.name])),
    [customers]
  );

  const visible = rows.filter((u) => {
    const q = filter.trim().toLowerCase();
    const matchesText =
      !q ||
      u.email.toLowerCase().includes(q) ||
      u.full_name.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q);
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    return matchesText && matchesRole;
  });

  const allVisibleSelected = visible.length > 0 && visible.every((u) => selected.has(u.id));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const u of visible) next.delete(u.id);
      } else {
        for (const u of visible) next.add(u.id);
      }
      return next;
    });
  }

  async function updateUser(
    id: string,
    patch: Partial<Pick<AdminUserRow, "role" | "is_active" | "is_demo_user" | "customer_id" | "internal_cost_rate" | "full_name">>
  ) {
    setError(null);
    setMessage(null);
    setSavingId(id);
    const supabase = createClient();
    const { error: updateError } = await supabase.from("profiles").update(patch).eq("id", id);
    setSavingId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setRows((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
    setMessage("User access updated.");
    router.refresh();
  }

  async function bulkUpdate(patch: Partial<Pick<AdminUserRow, "role" | "is_active" | "is_demo_user">>) {
    const ids = Array.from(selected).filter((id) => {
      if (id === currentUserId && patch.is_active === false) return false;
      return true;
    });
    if (ids.length === 0) {
      setError("Select at least one user (you cannot deactivate yourself).");
      return;
    }
    setError(null);
    setMessage(null);
    setBulkBusy(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.from("profiles").update(patch).in("id", ids);
    setBulkBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setRows((prev) => prev.map((u) => (ids.includes(u.id) ? { ...u, ...patch } : u)));
    setMessage(`Updated ${ids.length} user${ids.length === 1 ? "" : "s"}.`);
    setSelected(new Set());
    router.refresh();
  }

  const csvRows = visible.map((u) => [
    u.full_name,
    u.email,
    u.role,
    u.is_active ? "active" : "inactive",
    u.is_demo_user ? "yes" : "no",
    u.customer_id ? customerName.get(u.customer_id) ?? u.customer_id : "",
    u.internal_cost_rate ?? "",
  ]);

  return (
    <div className="space-y-4">
      {error ? <div className="alert alert-error text-sm">{error}</div> : null}
      {message ? <div className="alert alert-success text-sm">{message}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="form-control">
          <span className="label-text mb-1">Search users</span>
          <input
            className="input input-bordered"
            placeholder="Name, email, or role…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </label>
        <label className="form-control">
          <span className="label-text mb-1">Filter by role</span>
          <select className="select select-bordered" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="all">All roles</option>
            {ASSIGNABLE_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <CsvExportButton
            filename="users-export"
            headers={["Name", "Email", "Role", "Status", "Demo", "Customer", "Cost rate"]}
            rows={csvRows}
            label="Export users CSV"
            className="btn btn-outline w-full"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-box border border-base-300 bg-base-100 p-3">
        <span className="text-sm opacity-70">
          Bulk ({selected.size} selected)
        </span>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={bulkBusy || selected.size === 0}
          onClick={() => bulkUpdate({ is_active: true })}
        >
          Activate
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline btn-error"
          disabled={bulkBusy || selected.size === 0}
          onClick={() => bulkUpdate({ is_active: false })}
        >
          Deactivate
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline"
          disabled={bulkBusy || selected.size === 0}
          onClick={() => bulkUpdate({ is_demo_user: true })}
        >
          Mark demo
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          disabled={bulkBusy || selected.size === 0}
          onClick={() => bulkUpdate({ is_demo_user: false })}
        >
          Clear demo
        </button>
        <select
          className="select select-bordered select-sm"
          value={bulkRole}
          onChange={(e) => setBulkRole(e.target.value as UserRole)}
        >
          {ASSIGNABLE_ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          disabled={bulkBusy || selected.size === 0}
          onClick={() => bulkUpdate({ role: bulkRole })}
        >
          Set role
        </button>
      </div>

      <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  aria-label="Select all visible"
                />
              </th>
              <th>User</th>
              <th>Role</th>
              <th>Customer link</th>
              <th>Cost rate</th>
              <th>Flags</th>
              <th>Access</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={7} className="opacity-60">
                  No users match this filter.
                </td>
              </tr>
            ) : (
              visible.map((user) => {
                const busy = savingId === user.id;
                const isSelf = user.id === currentUserId;
                return (
                  <tr key={user.id} className={!user.is_active ? "opacity-60" : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={selected.has(user.id)}
                        onChange={() => toggleOne(user.id)}
                        aria-label={`Select ${user.full_name}`}
                      />
                    </td>
                    <td>
                      <p className="font-medium">{user.full_name}</p>
                      <p className="text-xs opacity-60">{user.email}</p>
                    </td>
                    <td>
                      <select
                        className="select select-bordered select-sm"
                        value={user.role}
                        disabled={busy || (isSelf && user.role === "admin")}
                        onChange={(e) => updateUser(user.id, { role: e.target.value as UserRole })}
                      >
                        {ASSIGNABLE_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        className="select select-bordered select-sm max-w-[11rem]"
                        value={user.customer_id ?? ""}
                        disabled={busy || user.role !== "customer"}
                        onChange={(e) =>
                          updateUser(user.id, { customer_id: e.target.value || null })
                        }
                      >
                        <option value="">{user.role === "customer" ? "Select customer…" : "—"}</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      {user.customer_id && user.role === "customer" ? (
                        <p className="mt-1 text-xs opacity-60">{customerName.get(user.customer_id)}</p>
                      ) : null}
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="input input-bordered input-sm w-24"
                        value={user.internal_cost_rate ?? ""}
                        disabled={busy}
                        onBlur={(e) => {
                          const next = e.target.value === "" ? null : Number(e.target.value);
                          if (next !== user.internal_cost_rate) {
                            updateUser(user.id, { internal_cost_rate: next });
                          }
                        }}
                        onChange={(e) => {
                          const next = e.target.value === "" ? null : Number(e.target.value);
                          setRows((prev) =>
                            prev.map((u) => (u.id === user.id ? { ...u, internal_cost_rate: next } : u))
                          );
                        }}
                      />
                    </td>
                    <td className="space-y-1">
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-xs"
                          checked={user.is_demo_user}
                          disabled={busy}
                          onChange={(e) => updateUser(user.id, { is_demo_user: e.target.checked })}
                        />
                        Demo
                      </label>
                      <div>
                        <StatusBadge status={user.is_active ? "active" : "inactive"} />
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`btn btn-sm ${user.is_active ? "btn-outline btn-error" : "btn-primary"}`}
                        disabled={busy || isSelf}
                        onClick={() => updateUser(user.id, { is_active: !user.is_active })}
                      >
                        {busy ? "Saving…" : user.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs opacity-60">
        Select rows for bulk activate/deactivate, demo flags, or role changes. You cannot deactivate your
        own Admin account.
      </p>
    </div>
  );
}
