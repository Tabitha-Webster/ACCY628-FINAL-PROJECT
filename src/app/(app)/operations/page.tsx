import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth";
import { isManagerRole } from "@/lib/constants";
import { EmptyState, ErrorState, PageHeader } from "@/components/ui";
import {
  ContractDeliveryBoard,
  type DeliveryContractCard,
} from "@/components/ContractDeliveryBoard";
import { projectCompletionPercent } from "@/components/ProjectProgressCard";
import {
  isIncompleteProjectStatus,
  isOpenTicketStatus,
} from "@/lib/contracts/delivery-completion";
import type { ContractStatus } from "@/lib/types";

type CustomerJoin = { name: string } | { name: string }[] | null;

function unwrapName(value: CustomerJoin): string | null {
  if (!value) return null;
  const row = Array.isArray(value) ? value[0] : value;
  return row?.name ?? null;
}

type ContractRow = {
  id: string;
  contract_number: string;
  name: string;
  status: ContractStatus;
  customers: CustomerJoin;
};

type TicketRow = {
  id: string;
  contract_id: string | null;
  ticket_number: string;
  title: string;
  status: string;
  priority: string;
  assigned_technician_id: string | null;
};

type ProjectRow = {
  id: string;
  contract_id: string | null;
  name: string;
  status: string;
};

type MilestoneRow = {
  project_id: string;
  completed: boolean | null;
  approval_status: string | null;
};

export default async function OperationsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!isManagerRole(profile.role)) redirect("/dashboard");

  const supabase = await createClient();

  const [
    { data: contractsData, error: contractsError },
    { data: ticketsData, error: ticketsError },
    { data: projectsData, error: projectsError },
    { data: milestonesData, error: milestonesError },
  ] = await Promise.all([
    supabase
      .from("contracts")
      .select("id, contract_number, name, status, customers(name)")
      .in("status", ["active", "on_hold"])
      .order("contract_number", { ascending: true }),
    supabase
      .from("support_tickets")
      .select(
        "id, contract_id, ticket_number, title, status, priority, assigned_technician_id"
      )
      .not("status", "eq", "canceled")
      .order("ticket_number", { ascending: true }),
    supabase
      .from("projects")
      .select("id, contract_id, name, status")
      .order("name", { ascending: true }),
    supabase.from("project_milestones").select("project_id, completed, approval_status"),
  ]);

  const error = contractsError || ticketsError || projectsError || milestonesError;
  const contracts = (contractsData ?? []) as ContractRow[];
  const tickets = (ticketsData ?? []) as TicketRow[];
  const projects = (projectsData ?? []) as ProjectRow[];
  const milestones = (milestonesData ?? []) as MilestoneRow[];

  const technicianIds = Array.from(
    new Set(tickets.map((t) => t.assigned_technician_id).filter((v): v is string => Boolean(v)))
  );
  const { data: techProfiles } = technicianIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", technicianIds)
    : { data: [] as { id: string; full_name: string }[] };
  const techName = new Map((techProfiles ?? []).map((p) => [p.id, p.full_name]));

  const milestonesByProject = new Map<string, { total: number; completed: number }>();
  for (const m of milestones) {
    const cur = milestonesByProject.get(m.project_id) ?? { total: 0, completed: 0 };
    cur.total += 1;
    if (m.completed || m.approval_status === "approved") cur.completed += 1;
    milestonesByProject.set(m.project_id, cur);
  }

  const ticketsByContract = new Map<string, TicketRow[]>();
  const unlinkedTickets: TicketRow[] = [];
  for (const t of tickets) {
    if (!t.contract_id) {
      unlinkedTickets.push(t);
      continue;
    }
    const list = ticketsByContract.get(t.contract_id) ?? [];
    list.push(t);
    ticketsByContract.set(t.contract_id, list);
  }

  const projectsByContract = new Map<string, ProjectRow[]>();
  const unlinkedProjects: ProjectRow[] = [];
  for (const p of projects) {
    if (!p.contract_id) {
      unlinkedProjects.push(p);
      continue;
    }
    const list = projectsByContract.get(p.contract_id) ?? [];
    list.push(p);
    projectsByContract.set(p.contract_id, list);
  }

  const boardContracts: DeliveryContractCard[] = contracts.map((contract) => {
    const linkedTickets = ticketsByContract.get(contract.id) ?? [];
    const linkedProjects = projectsByContract.get(contract.id) ?? [];
    const openTicketCount = linkedTickets.filter((t) => isOpenTicketStatus(t.status)).length;
    const incompleteProjectCount = linkedProjects.filter((p) =>
      isIncompleteProjectStatus(p.status)
    ).length;

    return {
      id: contract.id,
      contract_number: contract.contract_number,
      name: contract.name,
      status: contract.status,
      customerName: unwrapName(contract.customers) ?? "Unknown customer",
      ready: openTicketCount === 0 && incompleteProjectCount === 0,
      openTicketCount,
      incompleteProjectCount,
      tickets: linkedTickets.map((t) => ({
        id: t.id,
        ticket_number: t.ticket_number,
        title: t.title,
        status: t.status,
        priority: t.priority,
        technicianName: t.assigned_technician_id
          ? techName.get(t.assigned_technician_id) ?? null
          : null,
      })),
      projects: linkedProjects.map((p) => {
        const ms = milestonesByProject.get(p.id) ?? { total: 0, completed: 0 };
        return {
          id: p.id,
          name: p.name,
          status: p.status,
          progressPercent: projectCompletionPercent(p.status, ms.completed, ms.total),
        };
      }),
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ticket & Project Completion"
        description="Match tickets and projects to their contracts. Mark a contract completed only when linked delivery work is finished."
      />

      {error ? <ErrorState message={error.message} /> : null}

      {!error && contracts.length === 0 ? (
        <EmptyState
          title="No active contracts"
          description="Active and on-hold agreements will appear here with their linked tickets and projects."
        />
      ) : null}

      {!error && contracts.length > 0 ? (
        <ContractDeliveryBoard
          profileId={profile.id}
          contracts={boardContracts}
          unlinkedTickets={unlinkedTickets.map((t) => ({
            id: t.id,
            ticket_number: t.ticket_number,
            title: t.title,
          }))}
          unlinkedProjects={unlinkedProjects.map((p) => ({
            id: p.id,
            name: p.name,
            status: p.status,
          }))}
        />
      ) : null}
    </div>
  );
}
