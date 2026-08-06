"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  EDITABLE_PAGE_PERMISSIONS,
  editableRoles,
  type PagePermissionKey,
} from "@/lib/role-permissions";
import { roleLabel, type UserRole } from "@/lib/constants";

type MatrixRow = {
  role: UserRole;
  page_key: string;
  can_view: boolean;
};

type PermissionChange = {
  role: UserRole;
  page_key: PagePermissionKey;
  can_view: boolean;
  pageLabel: string;
};

export function RolePermissionsManager({ initialRows }: { initialRows: MatrixRow[] }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const roles = editableRoles();
  const pages = EDITABLE_PAGE_PERMISSIONS;
  const pageLabelByKey = useMemo(
    () => new Map(pages.map((page) => [page.key, page.label] as const)),
    [pages]
  );

  const initialMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const row of initialRows) {
      map.set(`${row.role}:${row.page_key}`, row.can_view);
    }
    return map;
  }, [initialRows]);

  const [values, setValues] = useState(() => new Map(initialMap));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<UserRole>(roles[0] ?? "manager");
  const [pendingConfirm, setPendingConfirm] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (pendingConfirm) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [pendingConfirm]);

  function keyFor(role: UserRole, pageKey: string) {
    return `${role}:${pageKey}`;
  }

  function isChecked(role: UserRole, pageKey: string) {
    return values.get(keyFor(role, pageKey)) ?? false;
  }

  function toggle(role: UserRole, pageKey: PagePermissionKey) {
    setValues((prev) => {
      const next = new Map(prev);
      const key = keyFor(role, pageKey);
      next.set(key, !(prev.get(key) ?? false));
      return next;
    });
    setMessage(null);
    setError(null);
  }

  const dirtyUpdates = useMemo(() => {
    const updates: PermissionChange[] = [];
    for (const page of pages) {
      for (const role of roles) {
        const key = keyFor(role, page.key);
        const current = values.get(key) ?? false;
        const original = initialMap.get(key) ?? false;
        if (current !== original) {
          updates.push({
            role,
            page_key: page.key,
            can_view: current,
            pageLabel: pageLabelByKey.get(page.key) ?? page.key,
          });
        }
      }
    }
    return updates;
  }, [values, initialMap, pages, roles, pageLabelByKey]);

  function requestSave() {
    if (dirtyUpdates.length === 0) {
      setMessage("No changes to save.");
      return;
    }
    setError(null);
    setMessage(null);
    setPendingConfirm(true);
  }

  function cancelSave() {
    if (saving) return;
    setPendingConfirm(false);
  }

  async function confirmSave() {
    if (dirtyUpdates.length === 0) {
      setPendingConfirm(false);
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);

    const res = await fetch("/api/admin/role-permissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updates: dirtyUpdates.map(({ role, page_key, can_view }) => ({
          role,
          page_key,
          can_view,
        })),
      }),
    });
    const data = (await res.json()) as { error?: string; updated?: number };
    setSaving(false);

    if (!res.ok) {
      setError(data.error ?? "Could not save permissions.");
      return;
    }

    setPendingConfirm(false);
    setMessage(`Saved ${data.updated ?? dirtyUpdates.length} permission change(s).`);
    router.refresh();
  }

  const groups = useMemo(() => {
    const map = new Map<string, typeof pages>();
    for (const page of pages) {
      const list = map.get(page.group) ?? [];
      list.push(page);
      map.set(page.group, list);
    }
    return Array.from(map.entries());
  }, [pages]);

  const confirming = pendingConfirm && saving;
  const enabling = dirtyUpdates.filter((change) => change.can_view);
  const disabling = dirtyUpdates.filter((change) => !change.can_view);
  const rolesTouched = Array.from(new Set(dirtyUpdates.map((change) => change.role)));

  return (
    <div className="space-y-4">
      {error ? <div className="alert alert-error text-sm">{error}</div> : null}
      {message ? <div className="alert alert-success text-sm">{message}</div> : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col items-start gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide opacity-70">Edit role</span>
          <select
            className="select select-bordered"
            value={selectedRole}
            disabled={pendingConfirm}
            onChange={(e) => setSelectedRole(e.target.value as UserRole)}
          >
            {roles.map((role) => (
              <option key={role} value={role}>
                {roleLabel(role)}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm opacity-70">
            Admin permissions are locked and always have full access.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving || pendingConfirm || dirtyUpdates.length === 0}
            onClick={requestSave}
          >
            {`Save changes${dirtyUpdates.length ? ` (${dirtyUpdates.length})` : ""}`}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100">
        <table className="table">
          <thead>
            <tr>
              <th>Page / module</th>
              <th className="w-40 text-center">{roleLabel(selectedRole)} can view</th>
              <th>Also enabled for</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(([group, groupPages]) => (
              <Fragment key={group}>
                <tr className="bg-base-200/50">
                  <td colSpan={3} className="text-xs font-semibold uppercase tracking-wide opacity-60">
                    {group}
                  </td>
                </tr>
                {groupPages.map((page) => {
                  const enabledElsewhere = roles
                    .filter((role) => role !== selectedRole && isChecked(role, page.key))
                    .map((role) => roleLabel(role));
                  return (
                    <tr key={page.key}>
                      <td>
                        <p className="font-medium">{page.label}</p>
                        <p className="text-sm opacity-70">{page.description}</p>
                      </td>
                      <td className="text-center">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-primary"
                          checked={isChecked(selectedRole, page.key)}
                          disabled={pendingConfirm}
                          onChange={() => toggle(selectedRole, page.key)}
                          aria-label={`${roleLabel(selectedRole)} can view ${page.label}`}
                        />
                      </td>
                      <td className="text-sm opacity-70">
                        {enabledElsewhere.length > 0 ? enabledElsewhere.join(", ") : "—"}
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-box border border-base-300 bg-base-100 p-4 text-sm opacity-80">
        Turning a page off hides it from that role&apos;s sidebar and blocks opening the URL directly.
        Database row-level security and in-page actions are unchanged. Permission changes ask for
        confirmation before saving.
      </div>

      <dialog
        ref={dialogRef}
        className="modal"
        onClose={cancelSave}
        onCancel={(event) => {
          if (confirming) {
            event.preventDefault();
            return;
          }
          cancelSave();
        }}
      >
        <div className="modal-box">
          <h3 className="text-lg font-semibold">Confirm permission changes</h3>
          <p className="mt-3 text-sm leading-relaxed">
            Do you want to save{" "}
            <span className="font-semibold">{dirtyUpdates.length}</span> permission change
            {dirtyUpdates.length === 1 ? "" : "s"} for{" "}
            <span className="font-semibold">
              {rolesTouched.map((role) => roleLabel(role)).join(", ")}
            </span>
            ?
          </p>

          {disabling.length > 0 ? (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Turning off</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {disabling.map((change) => (
                  <li key={`${change.role}:${change.page_key}`}>
                    {roleLabel(change.role)} → {change.pageLabel}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {enabling.length > 0 ? (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Turning on</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {enabling.map((change) => (
                  <li key={`${change.role}:${change.page_key}`}>
                    {roleLabel(change.role)} → {change.pageLabel}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="modal-action">
            <button type="button" className="btn btn-ghost" disabled={confirming} onClick={cancelSave}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={confirming}
              onClick={confirmSave}
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
