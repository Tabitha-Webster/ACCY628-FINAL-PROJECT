"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { SystemConfiguration } from "@/lib/system-configuration";

const FIELD_LABEL = "text-xs font-semibold uppercase tracking-wide opacity-70";

const SECTION_LABELS = {
  company: "Company settings",
  tax: "Tax defaults",
  numbering: "Numbering",
  integrations: "Integrations",
  demo: "Demo toggles",
} as const;

const FIELD_LABELS: Record<string, string> = {
  legalName: "Legal name",
  dbaName: "DBA / brand name",
  supportEmail: "Support email",
  billingEmail: "Billing email",
  phone: "Phone",
  address: "Address",
  timezone: "Timezone",
  currency: "Currency",
  taxLabel: "Tax label",
  taxId: "Tax ID",
  defaultTaxRatePct: "Default tax rate (%)",
  pricesIncludeTax: "Prices include tax",
  taxExemptByDefault: "Customers tax-exempt by default",
  invoicePrefix: "Invoice prefix",
  nextInvoiceSequence: "Next invoice sequence",
  contractPrefix: "Contract prefix",
  nextContractSequence: "Next contract sequence",
  ticketPrefix: "Ticket prefix",
  nextTicketSequence: "Next ticket sequence",
  paymentPrefix: "Payment prefix",
  nextPaymentSequence: "Next payment sequence",
  billingSyncEnabled: "Billing sync",
  emailNotificationsEnabled: "Email notifications",
  accountingExportEnabled: "Accounting export",
  paymentGatewayEnabled: "Payment gateway",
  webhookUrl: "Webhook URL",
  roleSwitcherEnabled: "Demo role switcher",
  loginSelectorEnabled: "Login demo selector",
  seedDataHintsEnabled: "Seed-data hints",
  allowDemoPasswordReset: "Allow demo password reset",
};

type SectionKey = keyof typeof SECTION_LABELS;

type PendingChange = {
  section: SectionKey;
  field: string;
  from: unknown;
  to: unknown;
};

function displayValue(value: unknown) {
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (value == null || value === "") return "—";
  return String(value);
}

function sectionChanged(a: Record<string, unknown>, b: Record<string, unknown>) {
  return JSON.stringify(a) !== JSON.stringify(b);
}

export function ConfigurationsManager({ initial }: { initial: SystemConfiguration }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [baseline, setBaseline] = useState(initial);
  const [config, setConfig] = useState(initial);
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  const [fieldResetKey, setFieldResetKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (pendingChange) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [pendingChange]);

  const dirtyCount = useMemo(() => {
    let count = 0;
    (Object.keys(SECTION_LABELS) as SectionKey[]).forEach((key) => {
      if (sectionChanged(config[key] as Record<string, unknown>, baseline[key] as Record<string, unknown>)) {
        count += 1;
      }
    });
    return count;
  }, [config, baseline]);

  function requestChange(section: SectionKey, field: string, nextValue: unknown) {
    const currentValue = (config[section] as Record<string, unknown>)[field];
    if (Object.is(currentValue, nextValue)) return;
    if (String(currentValue) === String(nextValue) && typeof currentValue !== "boolean") {
      // allow number/string coercion equality for empty edits
      if (typeof currentValue === "number" && Number(nextValue) === currentValue) return;
    }

    setError(null);
    setMessage(null);
    setPendingChange({
      section,
      field,
      from: currentValue,
      to: nextValue,
    });
  }

  function cancelChange() {
    setPendingChange(null);
    setFieldResetKey((key) => key + 1);
  }

  function confirmChange() {
    if (!pendingChange) return;
    const next = {
      ...config,
      [pendingChange.section]: {
        ...(config[pendingChange.section] as Record<string, unknown>),
        [pendingChange.field]: pendingChange.to,
      },
    } as SystemConfiguration;
    setConfig(next);
    setPendingChange(null);
  }

  async function save() {
    if (dirtyCount === 0) {
      setMessage("No changes to save.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/admin/configurations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    const data = (await res.json()) as { error?: string; config?: SystemConfiguration };
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Could not save configurations.");
      return;
    }
    const next = data.config ?? config;
    setConfig(next);
    setBaseline(next);
    setMessage("Configurations saved.");
    router.refresh();
  }

  const confirming = pendingChange != null;

  return (
    <div className="space-y-6">
      {error ? <div className="alert alert-error text-sm">{error}</div> : null}
      {message ? <div className="alert alert-success text-sm">{message}</div> : null}

      <div className="flex justify-end">
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving || confirming || dirtyCount === 0}
          onClick={save}
        >
          {saving ? "Saving…" : `Save configurations${dirtyCount ? ` (${dirtyCount})` : ""}`}
        </button>
      </div>

      <Section
        title="Company settings"
        description="Legal identity and contact defaults used across invoices and portal messaging."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <TextField
            key={`company-legalName-${fieldResetKey}-${config.company.legalName}`}
            label="Legal name"
            value={config.company.legalName}
            disabled={confirming}
            onCommit={(v) => requestChange("company", "legalName", v)}
          />
          <TextField
            key={`company-dbaName-${fieldResetKey}-${config.company.dbaName}`}
            label="DBA / brand name"
            value={config.company.dbaName}
            disabled={confirming}
            onCommit={(v) => requestChange("company", "dbaName", v)}
          />
          <TextField
            key={`company-supportEmail-${fieldResetKey}-${config.company.supportEmail}`}
            label="Support email"
            value={config.company.supportEmail}
            disabled={confirming}
            onCommit={(v) => requestChange("company", "supportEmail", v)}
          />
          <TextField
            key={`company-billingEmail-${fieldResetKey}-${config.company.billingEmail}`}
            label="Billing email"
            value={config.company.billingEmail}
            disabled={confirming}
            onCommit={(v) => requestChange("company", "billingEmail", v)}
          />
          <TextField
            key={`company-phone-${fieldResetKey}-${config.company.phone}`}
            label="Phone"
            value={config.company.phone}
            disabled={confirming}
            onCommit={(v) => requestChange("company", "phone", v)}
          />
          <TextField
            key={`company-timezone-${fieldResetKey}-${config.company.timezone}`}
            label="Timezone"
            value={config.company.timezone}
            disabled={confirming}
            onCommit={(v) => requestChange("company", "timezone", v)}
          />
          <TextField
            key={`company-currency-${fieldResetKey}-${config.company.currency}`}
            label="Currency"
            value={config.company.currency}
            disabled={confirming}
            onCommit={(v) => requestChange("company", "currency", v)}
          />
          <label className="flex flex-col items-start gap-1 md:col-span-2">
            <span className={FIELD_LABEL}>Address</span>
            <BlurTextArea
              key={`company-address-${fieldResetKey}-${config.company.address}`}
              value={config.company.address}
              disabled={confirming}
              onCommit={(v) => requestChange("company", "address", v)}
            />
          </label>
        </div>
      </Section>

      <Section title="Tax defaults" description="Default tax behavior for invoicing and customer setup.">
        <div className="grid gap-3 md:grid-cols-2">
          <TextField
            key={`tax-taxLabel-${fieldResetKey}-${config.tax.taxLabel}`}
            label="Tax label"
            value={config.tax.taxLabel}
            disabled={confirming}
            onCommit={(v) => requestChange("tax", "taxLabel", v)}
          />
          <TextField
            key={`tax-taxId-${fieldResetKey}-${config.tax.taxId}`}
            label="Tax ID"
            value={config.tax.taxId}
            disabled={confirming}
            onCommit={(v) => requestChange("tax", "taxId", v)}
          />
          <NumberField
            key={`tax-rate-${fieldResetKey}-${config.tax.defaultTaxRatePct}`}
            label="Default tax rate (%)"
            value={config.tax.defaultTaxRatePct}
            min={0}
            step={0.01}
            disabled={confirming}
            onCommit={(v) => requestChange("tax", "defaultTaxRatePct", v)}
          />
          <div className="space-y-2 self-end">
            <Toggle
              label="Prices include tax"
              checked={config.tax.pricesIncludeTax}
              disabled={confirming}
              onChange={(v) => requestChange("tax", "pricesIncludeTax", v)}
            />
            <Toggle
              label="Customers tax-exempt by default"
              checked={config.tax.taxExemptByDefault}
              disabled={confirming}
              onChange={(v) => requestChange("tax", "taxExemptByDefault", v)}
            />
          </div>
        </div>
      </Section>

      <Section
        title="Numbering"
        description="Prefixes and next sequence numbers for invoices, contracts, tickets, and payments."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <TextField
            key={`num-inv-prefix-${fieldResetKey}-${config.numbering.invoicePrefix}`}
            label="Invoice prefix"
            value={config.numbering.invoicePrefix}
            disabled={confirming}
            onCommit={(v) => requestChange("numbering", "invoicePrefix", v)}
          />
          <NumberField
            key={`num-inv-seq-${fieldResetKey}-${config.numbering.nextInvoiceSequence}`}
            label="Next invoice sequence"
            value={config.numbering.nextInvoiceSequence}
            min={1}
            step={1}
            disabled={confirming}
            onCommit={(v) => requestChange("numbering", "nextInvoiceSequence", v)}
          />
          <TextField
            key={`num-ctr-prefix-${fieldResetKey}-${config.numbering.contractPrefix}`}
            label="Contract prefix"
            value={config.numbering.contractPrefix}
            disabled={confirming}
            onCommit={(v) => requestChange("numbering", "contractPrefix", v)}
          />
          <NumberField
            key={`num-ctr-seq-${fieldResetKey}-${config.numbering.nextContractSequence}`}
            label="Next contract sequence"
            value={config.numbering.nextContractSequence}
            min={1}
            step={1}
            disabled={confirming}
            onCommit={(v) => requestChange("numbering", "nextContractSequence", v)}
          />
          <TextField
            key={`num-tkt-prefix-${fieldResetKey}-${config.numbering.ticketPrefix}`}
            label="Ticket prefix"
            value={config.numbering.ticketPrefix}
            disabled={confirming}
            onCommit={(v) => requestChange("numbering", "ticketPrefix", v)}
          />
          <NumberField
            key={`num-tkt-seq-${fieldResetKey}-${config.numbering.nextTicketSequence}`}
            label="Next ticket sequence"
            value={config.numbering.nextTicketSequence}
            min={1}
            step={1}
            disabled={confirming}
            onCommit={(v) => requestChange("numbering", "nextTicketSequence", v)}
          />
          <TextField
            key={`num-pmt-prefix-${fieldResetKey}-${config.numbering.paymentPrefix}`}
            label="Payment prefix"
            value={config.numbering.paymentPrefix}
            disabled={confirming}
            onCommit={(v) => requestChange("numbering", "paymentPrefix", v)}
          />
          <NumberField
            key={`num-pmt-seq-${fieldResetKey}-${config.numbering.nextPaymentSequence}`}
            label="Next payment sequence"
            value={config.numbering.nextPaymentSequence}
            min={1}
            step={1}
            disabled={confirming}
            onCommit={(v) => requestChange("numbering", "nextPaymentSequence", v)}
          />
        </div>
        <p className="mt-3 text-xs opacity-60">
          Preview: {config.numbering.invoicePrefix}
          {config.numbering.nextInvoiceSequence}, {config.numbering.contractPrefix}
          {config.numbering.nextContractSequence}, {config.numbering.ticketPrefix}
          {config.numbering.nextTicketSequence}, {config.numbering.paymentPrefix}
          {config.numbering.nextPaymentSequence}
        </p>
      </Section>

      <Section
        title="Integrations"
        description="Turn platform connections on or off for C2C operations. Secret keys are not stored here."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Toggle
            label="Billing sync"
            checked={config.integrations.billingSyncEnabled}
            disabled={confirming}
            onChange={(v) => requestChange("integrations", "billingSyncEnabled", v)}
          />
          <Toggle
            label="Email notifications"
            checked={config.integrations.emailNotificationsEnabled}
            disabled={confirming}
            onChange={(v) => requestChange("integrations", "emailNotificationsEnabled", v)}
          />
          <Toggle
            label="Accounting export"
            checked={config.integrations.accountingExportEnabled}
            disabled={confirming}
            onChange={(v) => requestChange("integrations", "accountingExportEnabled", v)}
          />
          <Toggle
            label="Payment gateway"
            checked={config.integrations.paymentGatewayEnabled}
            disabled={confirming}
            onChange={(v) => requestChange("integrations", "paymentGatewayEnabled", v)}
          />
          <div className="md:col-span-2">
            <TextField
              key={`integrations-webhook-${fieldResetKey}-${config.integrations.webhookUrl}`}
              label="Webhook URL (optional)"
              value={config.integrations.webhookUrl}
              disabled={confirming}
              onCommit={(v) => requestChange("integrations", "webhookUrl", v)}
            />
          </div>
        </div>
      </Section>

      <Section
        title="Demo toggles"
        description="Controls for classroom walkthrough tools. Production environments usually leave these off."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Toggle
            label="Demo role switcher"
            checked={config.demo.roleSwitcherEnabled}
            disabled={confirming}
            onChange={(v) => requestChange("demo", "roleSwitcherEnabled", v)}
          />
          <Toggle
            label="Login demo selector"
            checked={config.demo.loginSelectorEnabled}
            disabled={confirming}
            onChange={(v) => requestChange("demo", "loginSelectorEnabled", v)}
          />
          <Toggle
            label="Seed-data hints"
            checked={config.demo.seedDataHintsEnabled}
            disabled={confirming}
            onChange={(v) => requestChange("demo", "seedDataHintsEnabled", v)}
          />
          <Toggle
            label="Allow demo password reset"
            checked={config.demo.allowDemoPasswordReset}
            disabled={confirming}
            onChange={(v) => requestChange("demo", "allowDemoPasswordReset", v)}
          />
        </div>
      </Section>

      <p className="text-xs opacity-60">
        Each change asks for Cancel or Confirm. Confirmed edits stay on this screen until you click Save
        configurations.
      </p>

      <dialog
        ref={dialogRef}
        className="modal"
        onClose={cancelChange}
        onCancel={(event) => {
          event.preventDefault();
          cancelChange();
        }}
      >
        <div className="modal-box">
          <h3 className="text-lg font-semibold">Confirm configuration change</h3>
          {pendingChange ? (
            <p className="mt-3 text-sm leading-relaxed">
              Do you want to change{" "}
              <span className="font-semibold">
                {SECTION_LABELS[pendingChange.section]} ·{" "}
                {FIELD_LABELS[pendingChange.field] ?? pendingChange.field}
              </span>{" "}
              from <span className="font-semibold">{displayValue(pendingChange.from)}</span> to{" "}
              <span className="font-semibold">{displayValue(pendingChange.to)}</span>?
            </p>
          ) : null}
          <div className="modal-action">
            <button type="button" className="btn btn-ghost" onClick={cancelChange}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={confirmChange}>
              Confirm
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button type="submit" aria-label="Close">
            close
          </button>
        </form>
      </dialog>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-box border border-base-300 bg-base-100 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide opacity-70">{title}</h2>
      <p className="mt-1 text-sm opacity-70">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function TextField({
  label,
  value,
  onCommit,
  disabled = false,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col items-start gap-1">
      <span className={FIELD_LABEL}>{label}</span>
      <input
        className="input input-bordered w-full"
        defaultValue={value}
        disabled={disabled}
        onBlur={(e) => {
          if (e.target.value !== value) onCommit(e.target.value);
        }}
      />
    </label>
  );
}

function BlurTextArea({
  value,
  onCommit,
  disabled = false,
}: {
  value: string;
  onCommit: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <textarea
      className="textarea textarea-bordered w-full"
      rows={3}
      defaultValue={value}
      disabled={disabled}
      onBlur={(e) => {
        if (e.target.value !== value) onCommit(e.target.value);
      }}
    />
  );
}

function NumberField({
  label,
  value,
  onCommit,
  disabled = false,
  min,
  step,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  disabled?: boolean;
  min?: number;
  step?: number;
}) {
  return (
    <label className="flex flex-col items-start gap-1">
      <span className={FIELD_LABEL}>{label}</span>
      <input
        type="number"
        min={min}
        step={step}
        className="input input-bordered w-full"
        defaultValue={value}
        disabled={disabled}
        onBlur={(e) => {
          const next = Number(e.target.value);
          if (!Number.isFinite(next)) {
            e.target.value = String(value);
            return;
          }
          if (next !== value) onCommit(next);
        }}
      />
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-base-300 px-3 py-2">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="checkbox"
        className="toggle toggle-primary"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
