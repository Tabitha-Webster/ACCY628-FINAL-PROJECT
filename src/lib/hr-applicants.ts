/**
 * Demo HR applicants + match scoring from under-worked active contracts.
 * No DB table required — names are invented for class demos.
 */

export type DemoApplicant = {
  id: string;
  fullName: string;
  /** Role / skill they applied for (matched to open positions when possible). */
  appliedFor: string;
  /** Skill tags used to weight fit against contract coverage gaps. */
  skillTags: string[];
  appliedAt: string;
  note: string;
};

export type ContractHoursRow = {
  contractId: string;
  contractName: string;
  hours: number;
};

export type RankedApplicant = DemoApplicant & {
  matchPercent: number;
  stars: number;
  matchedOpenRole: string | null;
  ratingReason: string;
};

/** Invented people who applied — not existing hired contractors. */
export const DEMO_APPLICANTS: DemoApplicant[] = [
  {
    id: "app-avery",
    fullName: "Avery Quinn",
    appliedFor: "Service Desk Technician",
    skillTags: ["helpdesk", "support", "tickets"],
    appliedAt: "2026-07-28",
    note: "2 years MSP Tier-1; strong ticket triage.",
  },
  {
    id: "app-sam",
    fullName: "Sam Rivera",
    appliedFor: "Network Engineer",
    skillTags: ["network", "firewall", "infrastructure"],
    appliedAt: "2026-07-30",
    note: "CCNA; WAN troubleshooting and site-to-site VPN.",
  },
  {
    id: "app-jordan",
    fullName: "Jordan Blakelee",
    appliedFor: "Lead Technician",
    skillTags: ["support", "projects", "escalation"],
    appliedAt: "2026-08-01",
    note: "Escalation lead experience across multi-site clients.",
  },
  {
    id: "app-casey",
    fullName: "Casey Nguyen",
    appliedFor: "Project Delivery Specialist",
    skillTags: ["projects", "migration", "coordination"],
    appliedAt: "2026-08-02",
    note: "Cloud migration cutovers and customer coordination.",
  },
  {
    id: "app-riley",
    fullName: "Riley Soto",
    appliedFor: "Systems Administrator",
    skillTags: ["infrastructure", "servers", "microsoft"],
    appliedAt: "2026-08-03",
    note: "Hybrid AD / M365 admin background.",
  },
  {
    id: "app-morgan",
    fullName: "Morgan Ellis",
    appliedFor: "Help Desk Analyst",
    skillTags: ["helpdesk", "support", "remote"],
    appliedAt: "2026-08-04",
    note: "Remote support specialist; weekend availability.",
  },
  {
    id: "app-taylor",
    fullName: "Taylor Brooks",
    appliedFor: "Security Analyst",
    skillTags: ["security", "network", "compliance"],
    appliedAt: "2026-08-05",
    note: "Endpoint hardening and phishing response drills.",
  },
  {
    id: "app-parker",
    fullName: "Parker Kim",
    appliedFor: "Account Support Technician",
    skillTags: ["support", "customers", "onboarding"],
    appliedAt: "2026-08-05",
    note: "Customer onboarding and QBR prep support.",
  },
];

const LOW_HOURS_THRESHOLD = 1;

/** Stable 0–14 nudge from a string so applicants don't all share the same %. */
export function stableNudge(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return h % 15;
}

/**
 * Need score 0–100 from share of active contracts with little/no logged time.
 * Higher = more contracts not worked on = stronger hiring need.
 */
export function underWorkedNeedScore(rows: ContractHoursRow[]): number {
  if (rows.length === 0) return 58;
  const underWorked = rows.filter((r) => r.hours < LOW_HOURS_THRESHOLD).length;
  const share = underWorked / rows.length;
  // Keep scores in a demo-friendly band (about 35–95).
  return Math.round(35 + share * 60);
}

function roleAffinity(appliedFor: string, skillTags: string[]): number {
  const hay = `${appliedFor} ${skillTags.join(" ")}`.toLowerCase();
  let bonus = 0;
  if (/help|service desk|support|ticket|technician/.test(hay)) bonus += 8;
  if (/network|infra|system|security|server/.test(hay)) bonus += 6;
  if (/project|delivery|migration/.test(hay)) bonus += 5;
  if (/account|customer|onboard/.test(hay)) bonus += 4;
  return bonus;
}

export function matchPercentForApplicant(
  applicant: DemoApplicant,
  needScore: number
): number {
  const raw = needScore + roleAffinity(applicant.appliedFor, applicant.skillTags) + stableNudge(applicant.id) - 7;
  return Math.max(28, Math.min(98, Math.round(raw)));
}

export function starsFromMatch(matchPercent: number): number {
  if (matchPercent >= 88) return 5;
  if (matchPercent >= 72) return 4;
  if (matchPercent >= 55) return 3;
  if (matchPercent >= 40) return 2;
  return 1;
}

export function findMatchedOpenRole(
  applicant: DemoApplicant,
  openTitles: string[]
): string | null {
  const needle = applicant.appliedFor.toLowerCase();
  const tags = applicant.skillTags.map((t) => t.toLowerCase());
  for (const title of openTitles) {
    const t = title.toLowerCase();
    if (t.includes(needle) || needle.includes(t)) return title;
    if (tags.some((tag) => t.includes(tag))) return title;
  }
  // Soft keyword overlap with open titles
  for (const title of openTitles) {
    const t = title.toLowerCase();
    if (/tech|desk|support/.test(needle) && /tech|desk|support/.test(t)) return title;
    if (/network|system|admin|security/.test(needle) && /network|system|admin|security/.test(t)) {
      return title;
    }
  }
  return null;
}

export function rankDemoApplicants(input: {
  applicants?: DemoApplicant[];
  contractHours: ContractHoursRow[];
  openPositionTitles: string[];
}): RankedApplicant[] {
  const applicants = input.applicants ?? DEMO_APPLICANTS;
  const needScore = underWorkedNeedScore(input.contractHours);
  const underCount = input.contractHours.filter((r) => r.hours < LOW_HOURS_THRESHOLD).length;
  const total = input.contractHours.length;

  const reason =
    total > 0
      ? `${underCount} of ${total} active contracts need coverage — higher match means a stronger hire for those gaps.`
      : "Higher match means a stronger fit for current hiring need.";

  const ranked = applicants.map((applicant) => {
    const matchPercent = matchPercentForApplicant(applicant, needScore);
    return {
      ...applicant,
      matchPercent,
      stars: starsFromMatch(matchPercent),
      matchedOpenRole: findMatchedOpenRole(applicant, input.openPositionTitles),
      ratingReason: reason,
    };
  });

  ranked.sort((a, b) => b.matchPercent - a.matchPercent || a.fullName.localeCompare(b.fullName));
  return ranked;
}

/** Map RPC rows from hr_active_contract_hours() into ContractHoursRow. */
export function contractHoursFromRpc(
  rows: { contract_id: string; hours_worked: number | string | null }[]
): ContractHoursRow[] {
  return rows.map((r) => ({
    contractId: r.contract_id,
    contractName: "",
    hours: Number(r.hours_worked ?? 0),
  }));
}

/** Aggregate hours by contract from time entry rows. */
export function aggregateContractHours(
  contracts: { id: string; name: string }[],
  timeEntries: { contract_id: string | null; hours_worked: number | null }[]
): ContractHoursRow[] {
  const hoursByContract = new Map<string, number>();
  for (const entry of timeEntries) {
    if (!entry.contract_id) continue;
    const prev = hoursByContract.get(entry.contract_id) ?? 0;
    hoursByContract.set(entry.contract_id, prev + Number(entry.hours_worked ?? 0));
  }
  return contracts.map((c) => ({
    contractId: c.id,
    contractName: c.name,
    hours: hoursByContract.get(c.id) ?? 0,
  }));
}
