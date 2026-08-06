export type TechnicianSkillLevel = "junior" | "intermediate" | "senior";

export type TechnicianSkillProfile = {
  id: string;
  full_name: string;
  primary_specialty: string | null;
  skill_level: TechnicianSkillLevel | string | null;
  skill_tags: string[] | null;
};

export const SKILL_LEVEL_LABELS: Record<TechnicianSkillLevel, string> = {
  junior: "Junior",
  intermediate: "Intermediate",
  senior: "Senior",
};

export function skillLevelLabel(level: string | null | undefined) {
  if (!level) return "Unrated";
  return SKILL_LEVEL_LABELS[level as TechnicianSkillLevel] ?? level;
}

export function skillLevelTone(level: string | null | undefined) {
  if (level === "senior") return "badge-success";
  if (level === "intermediate") return "badge-info";
  if (level === "junior") return "badge-ghost";
  return "badge-ghost";
}

/** Manager may reassign technicians only while the agreement is still open. */
export const TECHNICIAN_REASSIGNABLE_STATUSES = [
  "draft",
  "pending_approval",
  "active",
] as const;

export function canReassignTechnicianForStatus(status: string | null | undefined) {
  return TECHNICIAN_REASSIGNABLE_STATUSES.includes(
    status as (typeof TECHNICIAN_REASSIGNABLE_STATUSES)[number]
  );
}

export function formatTechnicianOptionLabel(tech: TechnicianSkillProfile) {
  const specialty = tech.primary_specialty?.trim() || "General support";
  const level = skillLevelLabel(tech.skill_level);
  return `${tech.full_name} — ${specialty} · ${level}`;
}

/** Lightweight fit hint from contract services / type vs technician tags. */
export function technicianFitScore(input: {
  tech: TechnicianSkillProfile;
  contractType: string | null;
  includedServices: string | null;
  workLocation: string | null;
}) {
  const tags = (input.tech.skill_tags ?? []).map((t) => t.toLowerCase());
  const hay = `${input.contractType ?? ""} ${input.includedServices ?? ""} ${input.workLocation ?? ""}`.toLowerCase();
  let score = 0;

  const bump = (needle: string, points: number) => {
    if (hay.includes(needle) && (tags.some((t) => t.includes(needle) || needle.includes(t)) || tags.length === 0)) {
      score += points;
    } else if (hay.includes(needle) && tags.some((t) => t.includes(needle.split(" ")[0] ?? ""))) {
      score += points;
    }
  };

  for (const tag of tags) {
    if (tag && hay.includes(tag)) score += 12;
  }

  if (hay.includes("network") || hay.includes("firewall")) bump("network", 8);
  if (hay.includes("security") || hay.includes("endpoint") || hay.includes("backup")) bump("security", 8);
  if (hay.includes("project") || hay.includes("migration")) bump("project", 8);
  if (hay.includes("help desk") || hay.includes("helpdesk") || hay.includes("microsoft 365")) bump("helpdesk", 6);
  if (input.workLocation === "on_site" && tags.includes("onsite")) score += 10;
  if (input.workLocation === "remote" && tags.includes("remote")) score += 6;
  if (input.contractType === "project_only" && tags.includes("projects")) score += 14;
  if (input.contractType === "unlimited_remote" && tags.includes("remote")) score += 10;

  if (input.tech.skill_level === "senior") score += 6;
  else if (input.tech.skill_level === "intermediate") score += 3;

  return Math.min(100, Math.max(0, score));
}

export function recommendedTechnicianId(
  technicians: TechnicianSkillProfile[],
  contract: {
    contract_type: string | null;
    included_services: string | null;
    work_location: string | null;
  }
) {
  return rankTechniciansForContract(technicians, contract)[0]?.tech.id ?? null;
}

export function rankTechniciansForContract(
  technicians: TechnicianSkillProfile[],
  contract: {
    contract_type: string | null;
    included_services: string | null;
    work_location: string | null;
  }
) {
  return [...technicians]
    .map((tech) => ({
      tech,
      fit: technicianFitScore({
        tech,
        contractType: contract.contract_type,
        includedServices: contract.included_services,
        workLocation: contract.work_location,
      }),
    }))
    .sort(
      (a, b) =>
        b.fit - a.fit || a.tech.full_name.localeCompare(b.tech.full_name)
    );
}
