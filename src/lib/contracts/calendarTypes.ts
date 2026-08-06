export type CalendarEvent = {
  id: string;
  date: string;
  kind: "renewal" | "expiration" | "reminder";
  reminderKind?: string;
  label: string;
  contractId: string;
  contractNumber: string;
  customerName: string | null;
};
