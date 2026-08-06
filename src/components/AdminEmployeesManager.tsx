"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/ui";
import { roleLabel } from "@/lib/constants";

export type EmployeeRow = {
  id: string;
  full_name: string;
  title: string;
  department: string;
  role: "admin" | "manager" | "technician" | "billing" | "hr";
  email: string | null;
  notes: string | null;
  is_active: boolean;
};

const EMPLOYEE_ROLES: EmployeeRow["role"][] = ["admin", "manager", "technician", "billing", "hr"];

const EMPTY_FORM = {
  full_name: "",
  title: "",
  department: "",
  role: "technician" as EmployeeRow["role"],
  email: "",
  notes: "",
  is_active: true,
};

type FormState = typeof EMPTY_FORM;

export function AdminEmployeesManager({
  initialEmployees,
  canEdit = false,
}: {
  initialEmployees: EmployeeRow[];
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialEmployees);
  const [filter, setFilter] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<EmployeeRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return rows.filter((row) => {
      if (!showInactive && !row.is_active) return false;
      if (!q) return true;
      return (
        row.full_name.toLowerCase().includes(q) ||
        row.title.toLowerCase().includes(q) ||
        row.department.toLowerCase().includes(q) ||
        row.role.toLowerCase().includes(q) ||
        (row.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, filter, showInactive]);

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
    setError(null);
    setMessage(null);
  }

  function startEdit(row: EmployeeRow) {
    setEditingId(row.id);
    setForm({
      full_name: row.full_name,
      title: row.title,
      department: row.department,
      role: row.role,
      email: row.email ?? "",
      notes: row.notes ?? "",
      is_active: row.is_active,
    });
    setShowForm(true);
    setError(null);
    setMessage(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setBusy(true);
    setError(null);
    setMessage(null);

    const payload = {
      full_name: form.full_name.trim(),
      title: form.title.trim(),
      department: form.department.trim(),
      role: form.role,
      email: form.email.trim() || null,
      notes: form.notes.trim() || null,
      is_active: form.is_active,
      updated_at: new Date().toISOString(),
    };

    if (!payload.full_name || !payload.title || !payload.department) {
      setBusy(false);
      setError("Name, title, and department are required.");
      return;
    }

    const supabase = createClient();

    if (editingId) {
      const { data, error: updateError } = await supabase
        .from("employees")
        .update(payload)
        .eq("id", editingId)
        .select("id, full_name, title, department, role, email, notes, is_active")
        .single();

      setBusy(false);
      if (updateError) {
        setError(updateError.message);
        return;
      }

      setRows((current) => current.map((row) => (row.id === editingId ? (data as EmployeeRow) : row)));
      setMessage(`Updated ${payload.full_name}.`);
      closeForm();
      router.refresh();
      return;
    }

    const { data, error: insertError } = await supabase
      .from("employees")
      .insert(payload)
      .select("id, full_name, title, department, role, email, notes, is_active")
      .single();

    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }

    setRows((current) => [...current, data as EmployeeRow].sort((a, b) => a.full_name.localeCompare(b.full_name)));
    setMessage(`Added ${payload.full_name}.`);
    closeForm();
    router.refresh();
  }

  async function confirmRemove() {
    if (!canEdit || !pendingRemove) return;
    const row = pendingRemove;

    setBusy(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase.from("employees").delete().eq("id", row.id);
    setBusy(false);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setPendingRemove(null);
    setRows((current) => current.filter((item) => item.id !== row.id));
    if (editingId === row.id) {
      closeForm();
    }
    setMessage(`Removed ${row.full_name}.`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {message && !showForm ? <div className="alert alert-success text-sm">{message}</div> : null}
      {error && !showForm ? <div className="alert alert-error text-sm">{error}</div> : null}

      <div className="flex flex-wrap items-center gap-3">
        <input
          className="input input-bordered input-sm w-full max-w-xs"
          placeholder="Search employees"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {canEdit ? (
          <button type="button" className="btn btn-ghost btn-sm gap-1.5 px-2" onClick={startCreate} disabled={busy}>
            <span className="text-lg leading-none" aria-hidden>
              +
            </span>
            Add New Employee
          </button>
        ) : null}
        <label className="label cursor-pointer gap-2">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          <span className="label-text text-sm">Show inactive</span>
        </label>
        <p className="text-xs opacity-60">{visible.length} shown</p>
      </div>

      {canEdit && showForm ? (
        <div className="rounded-box border border-base-300 bg-base-100 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">{editingId ? "Edit employee" : "Add New Employee"}</h2>
              <p className="mt-1 text-xs opacity-60">
                Directory only. This does not create or delete login accounts.
              </p>
            </div>
            <button type="button" className="btn btn-sm btn-ghost" onClick={closeForm} disabled={busy}>
              Cancel
            </button>
          </div>

          <form className="mt-4 space-y-3" onSubmit={onSubmit}>
            {error ? <div className="alert alert-error text-sm">{error}</div> : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="form-control">
                <span className="label-text mb-1">Full name</span>
                <input
                  className="input input-bordered"
                  value={form.full_name}
                  onChange={(e) => setForm((current) => ({ ...current, full_name: e.target.value }))}
                  required
                />
              </label>
              <label className="form-control">
                <span className="label-text mb-1">Title</span>
                <input
                  className="input input-bordered"
                  value={form.title}
                  onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))}
                  required
                />
              </label>
              <label className="form-control">
                <span className="label-text mb-1">Department</span>
                <input
                  className="input input-bordered"
                  value={form.department}
                  onChange={(e) => setForm((current) => ({ ...current, department: e.target.value }))}
                  required
                />
              </label>
              <label className="form-control">
                <span className="label-text mb-1">App role</span>
                <select
                  className="select select-bordered"
                  value={form.role}
                  onChange={(e) =>
                    setForm((current) => ({ ...current, role: e.target.value as EmployeeRow["role"] }))
                  }
                >
                  {EMPLOYEE_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {roleLabel(role)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-control">
                <span className="label-text mb-1">Email (optional)</span>
                <input
                  type="email"
                  className="input input-bordered"
                  value={form.email}
                  onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))}
                  placeholder="demo login or work email"
                />
              </label>
              <label className="form-control">
                <span className="label-text mb-1">Notes (optional)</span>
                <input
                  className="input input-bordered"
                  value={form.notes}
                  onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))}
                />
              </label>
            </div>

            <label className="label cursor-pointer justify-start gap-2">
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={form.is_active}
                onChange={(e) => setForm((current) => ({ ...current, is_active: e.target.checked }))}
              />
              <span className="label-text">Active employee</span>
            </label>

            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
              {busy ? "Saving…" : editingId ? "Save changes" : "Add employee"}
            </button>
          </form>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100">
        <table className="table table-sm table-row-stripe">
          <thead>
            <tr>
              <th>Name</th>
              <th>Title</th>
              <th>Department</th>
              <th>Role</th>
              <th>Email</th>
              <th>Status</th>
              {canEdit ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 7 : 6} className="text-center opacity-60">
                  No employees match this filter.
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr key={row.id} className={!row.is_active ? "opacity-60" : undefined}>
                  <td className="font-medium">{row.full_name}</td>
                  <td>{row.title}</td>
                  <td>{row.department}</td>
                  <td>
                    <StatusBadge status={row.role} />
                  </td>
                  <td>{row.email ?? "—"}</td>
                  <td>{row.is_active ? "Active" : "Inactive"}</td>
                  {canEdit ? (
                    <td className="text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          onClick={() => startEdit(row)}
                          disabled={busy}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs text-error"
                          onClick={() => {
                            setError(null);
                            setPendingRemove(row);
                          }}
                          disabled={busy}
                          aria-label={`Remove ${row.full_name}`}
                          title="Remove employee"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {canEdit && pendingRemove ? (
        <div className="modal modal-open z-50">
          <div className="modal-box">
            <h3 className="text-lg font-semibold">Remove employee?</h3>
            <p className="mt-2 text-sm opacity-80">
              Remove <span className="font-medium">{pendingRemove.full_name}</span> from the employee
              directory? This does not delete their login account.
            </p>
            {error ? <div className="alert alert-error mt-3 text-sm">{error}</div> : null}
            <div className="modal-action">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setPendingRemove(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button type="button" className="btn btn-error" onClick={confirmRemove} disabled={busy}>
                {busy ? "Removing…" : "Confirm remove"}
              </button>
            </div>
          </div>
          <button
            type="button"
            className="modal-backdrop"
            aria-label="Cancel"
            onClick={() => !busy && setPendingRemove(null)}
          />
        </div>
      ) : null}
    </div>
  );
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}
