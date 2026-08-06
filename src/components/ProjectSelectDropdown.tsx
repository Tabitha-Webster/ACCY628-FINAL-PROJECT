"use client";

import { useRouter } from "next/navigation";

type Option = {
  id: string;
  name: string;
  customerName: string;
  status: string;
};

export function ProjectSelectDropdown({
  projects,
  selectedId,
  label = "Select a project",
}: {
  projects: Option[];
  selectedId: string | null;
  label?: string;
}) {
  const router = useRouter();

  return (
    <label className="form-control w-full max-w-xl">
      <span className="label py-1">
        <span className="label-text text-sm font-semibold text-base-content">{label}</span>
        <span className="label-text-alt text-base-content/70">{projects.length} total</span>
      </span>
      <select
        className="select select-bordered w-full bg-base-100 text-base-content"
        value={selectedId ?? ""}
        onChange={(e) => {
          const id = e.target.value;
          if (!id) return;
          router.push(`/projects?selected=${id}`);
        }}
        aria-label={label}
      >
        {projects.length === 0 ? (
          <option value="">No projects available</option>
        ) : (
          projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.customerName} ({p.status.replace(/_/g, " ")})
            </option>
          ))
        )}
      </select>
    </label>
  );
}
