"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ASSIGNABLE_ROLES, roleLabel, type UserRole } from "@/lib/constants";
import { StatusBadge } from "@/components/ui";
import { CsvExportButton } from "@/components/CsvExportButton";

export type AdminUserRow = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_demo_user: boolean;
  is_active: boolean;
};

type PendingRoleChange = {
  userId: string;
  fullName: string;
  fromRole: UserRole;
  toRole: UserRole;
};

const FIELD_LABEL = "text-xs font-semibold uppercase tracking-wide opacity-70";

type Props = {
  users: AdminUserRow[];
  currentUserId: string;
};

export function AdminUserManager({ users, currentUserId }: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState(users);
  const [filter, setFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingRoleChange, setPendingRoleChange] = useState<PendingRoleChange | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (pendingRoleChange) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [pendingRoleChange]);

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

  async function updateUser(
    id: string,
    patch: Partial<Pick<AdminUserRow, "role" | "is_active" | "is_demo_user" | "full_name">>
  ) {
    setError(null);
    setMessage(null);
    setSavingId(id);
    const supabase = createClient();
    const { error: updateError } = await supabase.from("profiles").update(patch).eq("id", id);
    setSavingId(null);
    if (updateError) {
      setError(updateError.message);
      return false;
    }
    setRows((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
    setMessage("User access updated.");
    router.refresh();
    return true;
  }

  function requestRoleChange(user: AdminUserRow, nextRole: UserRole) {
    if (nextRole === user.role) return;
    setError(null);
    setMessage(null);
    setPendingRoleChange({
      userId: user.id,
      fullName: user.full_name,
      fromRole: user.role,
      toRole: nextRole,
    });
  }

  function cancelRoleChange() {
    setPendingRoleChange(null);
  }

  async function confirmRoleChange() {
    if (!pendingRoleChange) return;
    const { userId, toRole } = pendingRoleChange;
    const ok = await updateUser(userId, { role: toRole });
    if (ok) setPendingRoleChange(null);
  }

  const csvRows = visible.map((u) => [
    u.full_name,
    u.email,
    roleLabel(u.role),
    u.is_active ? "active" : "inactive",
    u.is_demo_user ? "yes" : "no",
  ]);

  const confirming = pendingRoleChange != null && savingId === pendingRoleChange.userId;

  return (
    <div className="space-y-4">
      {error ? <div className="alert alert-error text-sm">{error}</div> : null}
      {message ? <div className="alert alert-success text-sm">{message}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col items-start gap-1">
          <span className={FIELD_LABEL}>Search users</span>
          <input
            className="input input-bordered w-full"
            placeholder="Name, email, or role…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </label>
        <label className="flex flex-col items-start gap-1">
          <span className={FIELD_LABEL}>Filter by role</span>
          <select
            className="select select-bordered w-full"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="all">All roles</option>
            {ASSIGNABLE_ROLES.map((role) => (
              <option key={role} value={role}>
                {roleLabel(role)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <CsvExportButton
            filename="users-export"
            headers={["Name", "Email", "Role", "Status", "Demo"]}
            rows={csvRows}
            label={
              <>
                <Download className="h-4 w-4" aria-hidden="true" />
                Export
              </>
            }
            className="btn btn-outline w-full gap-2"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Access</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={4} className="opacity-60">
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
                      <p className="font-medium">{user.full_name}</p>
                      <p className="text-xs opacity-60">{user.email}</p>
                    </td>
                    <td>
                      <select
                        className="select select-bordered select-sm"
                        value={user.role}
                        disabled={busy || pendingRoleChange != null || (isSelf && user.role === "admin")}
                        onChange={(e) => requestRoleChange(user, e.target.value as UserRole)}
                      >
                        {ASSIGNABLE_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {roleLabel(role)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <StatusBadge status={user.is_active ? "active" : "inactive"} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`btn btn-sm ${user.is_active ? "btn-outline btn-error" : "btn-primary"}`}
                        disabled={busy || isSelf || pendingRoleChange != null}
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
        Role changes ask for confirmation before saving. You cannot deactivate your own Admin account.
      </p>

      <dialog
        ref={dialogRef}
        className="modal"
        onClose={cancelRoleChange}
        onCancel={(event) => {
          if (confirming) {
            event.preventDefault();
            return;
          }
          cancelRoleChange();
        }}
      >
        <div className="modal-box">
          <h3 className="text-lg font-semibold">Confirm role change</h3>
          {pendingRoleChange ? (
            <p className="mt-3 text-sm leading-relaxed">
              Do you want to change <span className="font-semibold">{pendingRoleChange.fullName}</span>
              &apos;s role from{" "}
              <span className="font-semibold">{roleLabel(pendingRoleChange.fromRole)}</span> to{" "}
              <span className="font-semibold">{roleLabel(pendingRoleChange.toRole)}</span>?
            </p>
          ) : null}
          <div className="modal-action">
            <button type="button" className="btn btn-ghost" disabled={confirming} onClick={cancelRoleChange}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={confirming}
              onClick={confirmRoleChange}
            >
              {confirming ? "Saving…" : "Confirm"}
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button type="submit" aria-label="Close" disabled={confirming}>
            close
          </button>
        </form>
      </dialog>
    </div>
  );
}
