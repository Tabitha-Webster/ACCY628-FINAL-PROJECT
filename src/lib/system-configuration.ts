export type CompanySettings = {
  legalName: string;
  dbaName: string;
  supportEmail: string;
  billingEmail: string;
  phone: string;
  address: string;
  timezone: string;
  currency: string;
};

export type TaxDefaults = {
  defaultTaxRatePct: number;
  taxLabel: string;
  taxId: string;
  pricesIncludeTax: boolean;
  taxExemptByDefault: boolean;
};

export type NumberingSettings = {
  invoicePrefix: string;
  contractPrefix: string;
  ticketPrefix: string;
  paymentPrefix: string;
  nextInvoiceSequence: number;
  nextContractSequence: number;
  nextTicketSequence: number;
  nextPaymentSequence: number;
};

export type IntegrationSettings = {
  billingSyncEnabled: boolean;
  emailNotificationsEnabled: boolean;
  accountingExportEnabled: boolean;
  paymentGatewayEnabled: boolean;
  webhookUrl: string;
};

export type DemoToggles = {
  roleSwitcherEnabled: boolean;
  loginSelectorEnabled: boolean;
  seedDataHintsEnabled: boolean;
  allowDemoPasswordReset: boolean;
};

export type SystemConfiguration = {
  company: CompanySettings;
  tax: TaxDefaults;
  numbering: NumberingSettings;
  integrations: IntegrationSettings;
  demo: DemoToggles;
};

export const DEFAULT_SYSTEM_CONFIGURATION: SystemConfiguration = {
  company: {
    legalName: "ServiceSync MSP LLC",
    dbaName: "ServiceSync MSP",
    supportEmail: "support@servicesync.demo",
    billingEmail: "billing@servicesync.demo",
    phone: "",
    address: "",
    timezone: "America/Chicago",
    currency: "USD",
  },
  tax: {
    defaultTaxRatePct: 0,
    taxLabel: "Sales tax",
    taxId: "",
    pricesIncludeTax: false,
    taxExemptByDefault: false,
  },
  numbering: {
    invoicePrefix: "INV-",
    contractPrefix: "CTR-",
    ticketPrefix: "TKT-",
    paymentPrefix: "PMT-",
    nextInvoiceSequence: 1001,
    nextContractSequence: 1001,
    nextTicketSequence: 1001,
    nextPaymentSequence: 1001,
  },
  integrations: {
    billingSyncEnabled: true,
    emailNotificationsEnabled: true,
    accountingExportEnabled: false,
    paymentGatewayEnabled: false,
    webhookUrl: "",
  },
  demo: {
    roleSwitcherEnabled: true,
    loginSelectorEnabled: true,
    seedDataHintsEnabled: true,
    allowDemoPasswordReset: false,
  },
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback: number) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function mergeSystemConfiguration(raw: Partial<SystemConfiguration> | null | undefined): SystemConfiguration {
  const company = asObject(raw?.company);
  const tax = asObject(raw?.tax);
  const numbering = asObject(raw?.numbering);
  const integrations = asObject(raw?.integrations);
  const demo = asObject(raw?.demo);
  const d = DEFAULT_SYSTEM_CONFIGURATION;

  return {
    company: {
      legalName: asString(company.legalName, d.company.legalName),
      dbaName: asString(company.dbaName, d.company.dbaName),
      supportEmail: asString(company.supportEmail, d.company.supportEmail),
      billingEmail: asString(company.billingEmail, d.company.billingEmail),
      phone: asString(company.phone, d.company.phone),
      address: asString(company.address, d.company.address),
      timezone: asString(company.timezone, d.company.timezone),
      currency: asString(company.currency, d.company.currency),
    },
    tax: {
      defaultTaxRatePct: asNumber(tax.defaultTaxRatePct, d.tax.defaultTaxRatePct),
      taxLabel: asString(tax.taxLabel, d.tax.taxLabel),
      taxId: asString(tax.taxId, d.tax.taxId),
      pricesIncludeTax: asBoolean(tax.pricesIncludeTax, d.tax.pricesIncludeTax),
      taxExemptByDefault: asBoolean(tax.taxExemptByDefault, d.tax.taxExemptByDefault),
    },
    numbering: {
      invoicePrefix: asString(numbering.invoicePrefix, d.numbering.invoicePrefix),
      contractPrefix: asString(numbering.contractPrefix, d.numbering.contractPrefix),
      ticketPrefix: asString(numbering.ticketPrefix, d.numbering.ticketPrefix),
      paymentPrefix: asString(numbering.paymentPrefix, d.numbering.paymentPrefix),
      nextInvoiceSequence: Math.max(1, Math.floor(asNumber(numbering.nextInvoiceSequence, d.numbering.nextInvoiceSequence))),
      nextContractSequence: Math.max(1, Math.floor(asNumber(numbering.nextContractSequence, d.numbering.nextContractSequence))),
      nextTicketSequence: Math.max(1, Math.floor(asNumber(numbering.nextTicketSequence, d.numbering.nextTicketSequence))),
      nextPaymentSequence: Math.max(1, Math.floor(asNumber(numbering.nextPaymentSequence, d.numbering.nextPaymentSequence))),
    },
    integrations: {
      billingSyncEnabled: asBoolean(integrations.billingSyncEnabled, d.integrations.billingSyncEnabled),
      emailNotificationsEnabled: asBoolean(
        integrations.emailNotificationsEnabled,
        d.integrations.emailNotificationsEnabled
      ),
      accountingExportEnabled: asBoolean(
        integrations.accountingExportEnabled,
        d.integrations.accountingExportEnabled
      ),
      paymentGatewayEnabled: asBoolean(integrations.paymentGatewayEnabled, d.integrations.paymentGatewayEnabled),
      webhookUrl: asString(integrations.webhookUrl, d.integrations.webhookUrl),
    },
    demo: {
      roleSwitcherEnabled: asBoolean(demo.roleSwitcherEnabled, d.demo.roleSwitcherEnabled),
      loginSelectorEnabled: asBoolean(demo.loginSelectorEnabled, d.demo.loginSelectorEnabled),
      seedDataHintsEnabled: asBoolean(demo.seedDataHintsEnabled, d.demo.seedDataHintsEnabled),
      allowDemoPasswordReset: asBoolean(demo.allowDemoPasswordReset, d.demo.allowDemoPasswordReset),
    },
  };
}
