import { StatusBadge } from "@/components/ui";
import { evaluateTicketSla, slaConditionBadgeKey, type SlaCondition } from "@/lib/sla";

export function SlaConditionBadge({ condition }: { condition: SlaCondition }) {
  return <StatusBadge status={slaConditionBadgeKey(condition)} />;
}

export function TicketSlaAlerts({
  ticket,
}: {
  ticket: {
    submitted_at?: string | null;
    target_response_at?: string | null;
    target_resolution_at?: string | null;
    actual_response_at?: string | null;
    completed_at?: string | null;
    status?: string | null;
    priority?: string | null;
  };
}) {
  const sla = evaluateTicketSla(ticket);

  return (
    <div className="space-y-2">
      {sla.isCritical ? (
        <div className="alert alert-error text-sm" role="alert">
          <span>⚠ Critical priority — treat as highest urgency.</span>
        </div>
      ) : null}
      {sla.overdue ? (
        <div className="alert alert-error text-sm" role="alert">
          <span>
            ⚠ Overdue —{" "}
            {sla.responseOverdue && sla.resolutionOverdue
              ? "response and resolution deadlines have been missed."
              : sla.responseOverdue
                ? "the response deadline has passed with no actual response recorded."
                : "the resolution deadline has passed and the ticket is not resolved/closed."}
          </span>
        </div>
      ) : sla.overall === "at_risk" ? (
        <div className="alert alert-warning text-sm" role="status">
          <span>
            At Risk — at least 80% of an SLA window has elapsed and the requirement is not yet
            satisfied.
          </span>
        </div>
      ) : null}
      {sla.overall === "not_defined" ? (
        <div className="alert text-sm" role="status">
          <span>SLA Not Defined — this ticket has no contract response/resolution targets.</span>
        </div>
      ) : null}
    </div>
  );
}
