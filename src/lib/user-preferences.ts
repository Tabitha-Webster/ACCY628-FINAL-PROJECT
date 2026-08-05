import { ROLE_NAV, type NavItem, type UserRole } from "@/lib/constants";

export const PREFERENCES_STORAGE_KEY = "servicesync-preferences";

export type TableDensity = "comfortable" | "compact";
export type CurrencyStyle = "symbol" | "accounting" | "plain";
export type DateStyle = "medium" | "numeric" | "iso";
export type CsvDelimiter = "comma" | "semicolon" | "tab";

export type NotificationKey =
  | "invoiceIssued"
  | "paymentReceived"
  | "arOverdue"
  | "contractRenewal"
  | "billingExceptions";

export type UserPreferences = {
  defaultLanding: string;
  tableDensity: TableDensity;
  rowsPerPage: number;
  currencyStyle: CurrencyStyle;
  dateStyle: DateStyle;
  timeZone: string;
  notifications: Record<NotificationKey, boolean>;
  csvIncludeHeaders: boolean;
  csvDelimiter: CsvDelimiter;
  billingContactEmail: string;
  defaultPaymentMethod: string;
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  defaultLanding: "/dashboard",
  tableDensity: "comfortable",
  rowsPerPage: 25,
  currencyStyle: "symbol",
  dateStyle: "medium",
  timeZone: "system",
  notifications: {
    invoiceIssued: true,
    paymentReceived: true,
    arOverdue: true,
    contractRenewal: true,
    billingExceptions: true,
  },
  csvIncludeHeaders: true,
  csvDelimiter: "comma",
  billingContactEmail: "",
  defaultPaymentMethod: "ach",
};

export function loadPreferences(): UserPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      notifications: { ...DEFAULT_PREFERENCES.notifications, ...(parsed.notifications ?? {}) },
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(preferences: UserPreferences) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
}

export function applyPreferencesToDom(preferences: UserPreferences) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-density", preferences.tableDensity);
}

/** Routes that live inside nav dropdowns and are not top-level ROLE_NAV entries. */
const EXTRA_LANDING_OPTIONS: Partial<Record<UserRole, NavItem[]>> = {
  manager: [{ href: "/contracts", label: "Manage Contracts" }],
  billing: [
    { href: "/contracts", label: "Manage Contracts" },
    { href: "/billing-review", label: "Overview" },
    { href: "/invoices", label: "Invoices" },
    { href: "/accounts-receivable", label: "Accounts Receivable" },
    { href: "/payments", label: "Payment History" },
    { href: "/accounting", label: "Accounting Review" },
  ],
  customer: [
    { href: "/my-invoices", label: "Invoices" },
    { href: "/make-payment", label: "Make a Payment" },
  ],
};

export function landingOptionsForRole(role: UserRole): NavItem[] {
  const seen = new Set<string>();
  return [...(ROLE_NAV[role] ?? []), ...(EXTRA_LANDING_OPTIONS[role] ?? [])].filter((item) => {
    if (seen.has(item.href)) return false;
    seen.add(item.href);
    return true;
  });
}

export const NOTIFICATION_OPTIONS: {
  key: NotificationKey;
  label: string;
  description: string;
  roles: UserRole[];
}[] = [
  {
    key: "invoiceIssued",
    label: "Invoice issued",
    description: "An invoice is generated or sent to a customer.",
    roles: ["manager", "billing", "customer"],
  },
  {
    key: "paymentReceived",
    label: "Payment received",
    description: "A payment is recorded against an invoice.",
    roles: ["manager", "billing", "customer"],
  },
  {
    key: "arOverdue",
    label: "Receivable past due",
    description: "An open invoice moves past its due date or escalates.",
    roles: ["manager", "billing"],
  },
  {
    key: "contractRenewal",
    label: "Contract renewal or expiration",
    description: "An agreement is approaching renewal or expiration.",
    roles: ["manager", "billing", "technician", "customer"],
  },
  {
    key: "billingExceptions",
    label: "Billing exceptions",
    description: "Unapproved time or costs are blocking billing.",
    roles: ["manager", "billing"],
  },
];

export const TIME_ZONE_OPTIONS = [
  { id: "system", label: "Use this device's time zone" },
  { id: "America/New_York", label: "Eastern (New York)" },
  { id: "America/Chicago", label: "Central (Chicago)" },
  { id: "America/Denver", label: "Mountain (Denver)" },
  { id: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { id: "UTC", label: "UTC" },
];

export function previewCurrency(value: number, style: CurrencyStyle) {
  if (style === "plain") {
    return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2 }).format(value);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    currencySign: style === "accounting" ? "accounting" : "standard",
    minimumFractionDigits: 2,
  }).format(value);
}

export function previewDate(value: Date, style: DateStyle, timeZone: string) {
  const zone = timeZone === "system" ? undefined : timeZone;
  if (style === "iso") {
    const parts = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: zone,
    }).format(value);
    return parts;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: style === "numeric" ? "2-digit" : "short",
    day: style === "numeric" ? "2-digit" : "numeric",
    year: "numeric",
    timeZone: zone,
  }).format(value);
}
