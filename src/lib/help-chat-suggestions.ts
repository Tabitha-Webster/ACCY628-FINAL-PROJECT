import type { UserRole } from "@/lib/constants";

/** Clickable starter questions shown in the Help bubble before the user types. */
export function helpChatSuggestionsForRole(role: UserRole): string[] {
  switch (role) {
    case "customer":
      return [
        "What's my invoice balance due?",
        "Do I have any open support requests?",
        "How many contract hours have I used this month?",
        "Where do I pay an invoice?",
        "What active contracts do I have?",
      ];
    case "technician":
      return [
        "What tickets are assigned to me?",
        "Where do I submit time and costs?",
        "Where do I open support tickets?",
        "How do I view my project tasks?",
      ];
    case "billing":
      return [
        "Where do I review invoices?",
        "Where is accounts receivable?",
        "Where do I record a payment?",
        "What screens can I open?",
      ];
    case "manager":
      return [
        "Where do I manage contracts?",
        "Where do I approve time and costs?",
        "Where is the manager dashboard?",
        "What screens can I open?",
      ];
    case "executive":
      return [
        "Where is the executive dashboard?",
        "Where do I review customers?",
        "Where are contracts awaiting signature?",
        "What screens can I open?",
      ];
    case "admin":
      return [
        "Where do I manage user access?",
        "Where do I approve new customers?",
        "Where are system configurations?",
        "What screens can I open?",
      ];
    default:
      return [
        "What screens can I open?",
        "Where is my dashboard?",
        "How do I find customers?",
      ];
  }
}
