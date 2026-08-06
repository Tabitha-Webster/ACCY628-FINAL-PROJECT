"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SignaturePad } from "@/components/SignaturePad";
import { buildContractPdfBlob, downloadPdfBlob } from "@/lib/contracts/build-contract-pdf";
import { formatCurrency } from "@/lib/format";
import {
  formatTechnicianOptionLabel,
  rankTechniciansForContract,
  skillLevelLabel,
  type TechnicianSkillProfile,
} from "@/lib/technicians/skills";
import {
  BILLING_FREQUENCIES,
  BILLING_METHOD_OPTIONS,
  BILLING_TIMINGS,
  CONTRACT_BILLING_STATUSES,
  CONTRACT_BILLING_STATUS_LABELS,
  CONTRACT_STATUSES,
  CONTRACT_STATUS_LABELS,
  CONTRACT_TYPE_LABELS,
  CONTRACT_TYPES,
  RENEWAL_TYPES,
  WORK_LOCATION_LABELS,
  WORK_LOCATIONS,
  CONTRACT_COVERED_SERVICE_OPTIONS,
  CONTRACT_EXCLUDED_SERVICE_OPTIONS,
  buildDemoSignatureDataUrl,
  contractFormToPayload,
  emptyContractFormValues,
  validateContractDraftValues,
  validateContractFormValues,
  diffContractFormValues,
  locationAdjustedAmount,
  workLocationAdjustmentLabel,
  packetSignaturesForPdf,
  pdfContractFromFormValues,
  type ContractFormFieldErrors,
  type ContractFormValues,
} from "@/lib/contracts";

export type ContractFormOption = { id: string; label: string };

function parseServiceList(value: string): string[] {
  return value
    .split(/\n|;|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinServiceList(items: string[]): string {
  return items.join("\n");
}

function ServiceChecklist({
  options,
  selected,
  onToggle,
}: {
  options: readonly string[];
  selected: string[];
  onToggle: (option: string) => void;
}) {
  const selectedSet = new Set(selected);
  const extras = selected.filter((item) => !options.includes(item));

  return (
    <div className="w-full space-y-2">
      <div className="max-h-56 w-full overflow-auto rounded-lg border border-base-300 bg-base-100 p-3">
        <ul className="space-y-2">
          {options.map((option) => {
            const checked = selectedSet.has(option);
            return (
              <li key={option}>
                <label className="flex cursor-pointer items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-primary mt-0.5"
                    checked={checked}
                    onChange={() => onToggle(option)}
                  />
                  <span>{option}</span>
                </label>
              </li>
            );
          })}
          {extras.map((option) => (
            <li key={`extra-${option}`}>
              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="checkbox checkbox-primary mt-0.5"
                  checked
                  onChange={() => onToggle(option)}
                />
                <span>
                  {option}
                  <span className="ml-1 opacity-50">(existing)</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs opacity-60">
        {selected.length === 0
          ? "Select one or more options."
          : `${selected.length} selected`}
      </p>
    </div>
  );
}

type Props = {
  mode: "create" | "edit";
  profileId: string;
  profileName?: string;
  contractId?: string;
  currentVersion?: number;
  initialValues?: Partial<ContractFormValues>;
  customers: ContractFormOption[];
  managers: ContractFormOption[];
  technicians?: TechnicianSkillProfile[];
  /** From Admin → Configurations → Numbering (defaults to CTR-). */
  contractNumberPrefix?: string;
};

async function consumeContractNumber(contractNumber: string) {
  try {
    await fetch("/api/numbering/next", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "contract", consume: contractNumber }),
    });
  } catch {
    // Non-blocking — contract is already saved.
  }
}

const CREATE_STEPS = [
  { id: "details", label: "Details & dates" },
  { id: "assignment", label: "Assignment & billing" },
  { id: "coverage", label: "Coverage & SLA" },
  { id: "review", label: "Review & send" },
] as const;

const EDIT_STEPS = [
  { id: "details", label: "Details & dates" },
  { id: "assignment", label: "Assignment & billing" },
  { id: "coverage", label: "Coverage & SLA" },
  { id: "review", label: "Review & save" },
] as const;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-left text-xs text-error">{message}</p>;
}

function FormField({
  label,
  error,
  className = "",
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`form-control w-full min-w-0 ${className}`}>
      <span className="mb-1.5 block min-h-5 text-left text-xs font-medium leading-5 tracking-wide opacity-70">
        {label}
      </span>
      <div className="flex w-full justify-start">{children}</div>
      <FieldError message={error} />
    </label>
  );
}

const fieldControlClass = "input input-bordered h-10 w-full text-left";
const selectControlClass = "select select-bordered h-10 w-full text-left";
const textareaControlClass = "textarea textarea-bordered w-full text-left";
const fieldGridClass = "grid grid-cols-1 items-start gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-3";

export function ContractForm({
  mode,
  profileId,
  profileName = "Manager",
  contractId,
  currentVersion = 1,
  initialValues,
  customers,
  managers,
  technicians = [],
  contractNumberPrefix = "CTR-",
}: Props) {
  const router = useRouter();
  const [values, setValues] = useState<ContractFormValues>(() =>
    emptyContractFormValues(initialValues)
  );
  const [baseline] = useState<ContractFormValues>(() => emptyContractFormValues(initialValues));
  const [wizardStep, setWizardStep] = useState(0);
  const [selectedSlaLevel, setSelectedSlaLevel] = useState<
    "critical" | "high" | "medium" | "low"
  >("critical");
  const [customerSource, setCustomerSource] = useState<"existing" | "new">(
    mode === "create" && customers.length === 0 ? "new" : "existing"
  );
  const [newCustomerName, setNewCustomerName] = useState("");
  const [customerOptions, setCustomerOptions] = useState(customers);
  const [fieldErrors, setFieldErrors] = useState<ContractFormFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [signatureAck, setSignatureAck] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pdfRefreshKey, setPdfRefreshKey] = useState(0);

  const title =
    mode === "create"
      ? "New Contract"
      : baseline.status === "draft"
        ? "Complete Draft Contract"
        : "Edit Contract";
  const isDraftWorkflow = mode === "create" || baseline.status === "draft";
  const cancelHref =
    mode === "edit" && !isDraftWorkflow ? "/contracts/view-edit" : "/contracts";
  const isActiveContract = mode === "edit" && baseline.status === "active";
  const wizardSteps = isDraftWorkflow ? CREATE_STEPS : EDIT_STEPS;

  const slaHoursFieldKey = {
    critical: "sla_critical_response_hours",
    high: "sla_high_response_hours",
    medium: "sla_medium_response_hours",
    low: "sla_low_response_hours",
  } as const satisfies Record<"critical" | "high" | "medium" | "low", keyof ContractFormValues>;

  const coveredServicesSelected = useMemo(
    () => parseServiceList(values.included_services),
    [values.included_services]
  );
  const excludedServicesSelected = useMemo(
    () => parseServiceList(values.excluded_services),
    [values.excluded_services]
  );
  const canCreateAndSend = Boolean(signatureData && signatureAck && !saving);
  const canSaveEdit = !saving;

  const customerLabel =
    customerSource === "new"
      ? newCustomerName.trim() || "New customer"
      : customerOptions.find((c) => c.id === values.customer_id)?.label ?? "Customer";
  const managerLabel =
    managers.find((m) => m.id === values.assigned_manager_id)?.label ?? profileName;

  const rankedTechnicians = useMemo(
    () =>
      rankTechniciansForContract(technicians, {
        contract_type: values.contract_type || null,
        included_services: values.included_services || null,
        work_location: values.work_location || null,
      }),
    [technicians, values.contract_type, values.included_services, values.work_location]
  );
  const recommendedTechnician = rankedTechnicians[0]?.tech ?? null;
  const recommendedFit = rankedTechnicians[0]?.fit ?? 0;
  const selectedTechnician =
    technicians.find((t) => t.id === values.assigned_technician_id) ?? null;

  useEffect(() => {
    if (wizardStep !== 3) return;
    let revoked: string | null = null;
    let cancelled = false;
    (async () => {
      const blob = await buildContractPdfBlob({
        contract: pdfContractFromFormValues(
          values,
          isDraftWorkflow ? "draft" : "pending_approval"
        ),
        customerName: customerLabel,
        managerName: managerLabel,
        technicianName: selectedTechnician?.full_name ?? null,
        signatures: packetSignaturesForPdf(
          mode === "create" && signatureData
            ? {
                id: "preview",
                contract_id: "preview",
                status: "draft",
                is_current: true,
                storage_path: null,
                document_id: null,
                manager_signed_by: null,
                manager_signed_at: null,
                manager_signature_data: signatureData,
                manager_signer_name: profileName,
                executive_signed_by: null,
                executive_signed_at: null,
                executive_signature_data: null,
                executive_signer_name: null,
                admin_signed_by: null,
                admin_signed_at: null,
                admin_signature_data: null,
                admin_signer_name: null,
                customer_signed_by: null,
                customer_signed_at: null,
                customer_signature_data: null,
                customer_signer_name: null,
                rejection_reason: null,
                rejected_by: null,
                rejected_at: null,
                created_by: profileId,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }
            : mode === "edit"
              ? {
                  id: "preview-edit",
                  contract_id: contractId ?? "preview",
                  status: "draft",
                  is_current: true,
                  storage_path: null,
                  document_id: null,
                  manager_signed_by: null,
                  manager_signed_at: null,
                  manager_signature_data: buildDemoSignatureDataUrl(profileName || "Emilie Pierson"),
                  manager_signer_name: profileName || "Emilie Pierson",
                  executive_signed_by: null,
                  executive_signed_at: null,
                  executive_signature_data: null,
                  executive_signer_name: null,
                  admin_signed_by: null,
                  admin_signed_at: null,
                  admin_signature_data: null,
                  admin_signer_name: null,
                  customer_signed_by: null,
                  customer_signed_at: null,
                  customer_signature_data: null,
                  customer_signer_name: null,
                  rejection_reason: null,
                  rejected_by: null,
                  rejected_at: null,
                  created_by: profileId,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                }
              : null
        ),
      });
      if (cancelled) return;
      const url = URL.createObjectURL(blob);
      revoked = url;
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    })().catch(() => {
      if (!cancelled) setFormError("Could not build the contract PDF preview.");
    });
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [
    wizardStep,
    values,
    customerLabel,
    managerLabel,
    selectedTechnician,
    signatureData,
    profileName,
    profileId,
    mode,
    contractId,
    isDraftWorkflow,
    pdfRefreshKey,
  ]);

  function update<K extends keyof ContractFormValues>(key: K, value: ContractFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function verifyCustomerExists(customerId: string) {
    if (!customerId) return false;
    if (customerOptions.some((c) => c.id === customerId)) return true;
    const supabase = createClient();
    const { data } = await supabase.from("customers").select("id").eq("id", customerId).maybeSingle();
    return Boolean(data);
  }

  async function createCustomerIfNeeded(): Promise<{ customerId: string | null; error: string | null }> {
    if (customerSource !== "new") {
      return { customerId: values.customer_id || null, error: null };
    }

    const name = newCustomerName.trim();
    if (!name) {
      return { customerId: null, error: "Enter a customer name." };
    }

    const supabase = createClient();
    const { data: existing } = await supabase
      .from("customers")
      .select("id, name")
      .ilike("name", name)
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      setCustomerOptions((prev) =>
        prev.some((c) => c.id === existing.id)
          ? prev
          : [...prev, { id: existing.id, label: existing.name }].sort((a, b) =>
              a.label.localeCompare(b.label)
            )
      );
      update("customer_id", existing.id);
      setCustomerSource("existing");
      setNewCustomerName("");
      return { customerId: existing.id, error: null };
    }

    const { data, error } = await supabase
      .from("customers")
      .insert({
        name,
        status: "active",
        account_manager_id: profileId,
      })
      .select("id, name")
      .maybeSingle();

    if (error || !data?.id) {
      return { customerId: null, error: error?.message ?? "Could not create customer." };
    }

    setCustomerOptions((prev) =>
      [...prev, { id: data.id, label: data.name }].sort((a, b) => a.label.localeCompare(b.label))
    );
    update("customer_id", data.id);
    setCustomerSource("existing");
    setNewCustomerName("");
    return { customerId: data.id, error: null };
  }

  async function verifyContractNumberUnique(contractNumber: string) {
    const normalized = contractNumber.trim();
    if (!normalized) return false;
    const supabase = createClient();
    let query = supabase.from("contracts").select("id").eq("contract_number", normalized).limit(1);
    if (mode === "edit" && contractId) {
      query = query.neq("id", contractId);
    }
    const { data } = await query.maybeSingle();
    return !data;
  }

  function toggleService(
    field: "included_services" | "excluded_services",
    option: string
  ) {
    const current = parseServiceList(values[field]);
    const next = current.includes(option)
      ? current.filter((item) => item !== option)
      : [...current, option];
    update(field, joinServiceList(next));
  }

  async function goNextStep() {
    setFormError(null);
    // Allow clicking through freely; full validation runs on create/save.
    if (wizardStep === 0 && mode === "create" && customerSource === "new" && newCustomerName.trim()) {
      setSaving(true);
      const created = await createCustomerIfNeeded();
      setSaving(false);
      if (created.error) {
        setFieldErrors({ customer_id: created.error });
        setFormError(created.error);
        return;
      }
    }
    setWizardStep((step) => Math.min(3, step + 1));
  }

  async function saveAsDraft() {
    setFormError(null);
    setSaving(true);
    const supabase = createClient();

    let customerIdForSave = values.customer_id;
    if (customerSource === "new") {
      const created = await createCustomerIfNeeded();
      if (created.error || !created.customerId) {
        setFieldErrors({ customer_id: created.error ?? "Enter a customer name." });
        setFormError(created.error ?? "Select or create a customer before saving a draft.");
        setWizardStep(0);
        setSaving(false);
        return;
      }
      customerIdForSave = created.customerId;
    }

    const today = new Date().toISOString().slice(0, 10);
    const valuesForSave: ContractFormValues = {
      ...values,
      customer_id: customerIdForSave,
      status: "draft",
      name: values.name.trim() || "Untitled draft",
      start_date: values.start_date || today,
      effective_date: values.effective_date || values.start_date || today,
    };

    const customerExists = await verifyCustomerExists(valuesForSave.customer_id);
    const contractNumberUnique = await verifyContractNumberUnique(valuesForSave.contract_number);
    const validation = validateContractDraftValues(valuesForSave, {
      customerExists,
      contractNumberUnique,
    });
    if (!validation.ok) {
      setFieldErrors(validation.fieldErrors);
      setFormError(validation.formError);
      setWizardStep(0);
      setSaving(false);
      return;
    }

    const payload = {
      ...contractFormToPayload(valuesForSave, profileId, mode === "create" ? "create" : "edit"),
      status: "draft",
    };

    if (mode === "create") {
      const { data, error } = await supabase
        .from("contracts")
        .insert(payload)
        .select("id")
        .maybeSingle();
      if (error || !data?.id) {
        setSaving(false);
        if (error?.message.toLowerCase().includes("contract_number")) {
          setFieldErrors({ contract_number: "Contract number must be unique." });
          setFormError("Please fix the highlighted validation errors before saving.");
          setWizardStep(0);
          return;
        }
        setFormError(error?.message ?? "Could not save draft.");
        return;
      }

      await supabase.from("contract_versions").insert({
        contract_id: data.id,
        version_number: 1,
        change_summary: "Draft saved — not yet sent to executive",
        created_by: profileId,
      });

      await supabase.from("contract_changes").insert({
        contract_id: data.id,
        field_name: "status",
        previous_value: null,
        new_value: "draft",
        change_reason: "Manager saved incomplete contract as draft",
        changed_by: profileId,
        source: "create_wizard",
      });

      await consumeContractNumber(valuesForSave.contract_number);

      setSaving(false);
      router.push("/contracts?status=draft");
      router.refresh();
      return;
    }

    if (!contractId) {
      setFormError("Missing contract id.");
      setSaving(false);
      return;
    }

    const nextVersion = currentVersion + 1;
    const { error } = await supabase
      .from("contracts")
      .update({ ...payload, version_number: nextVersion })
      .eq("id", contractId);

    if (error) {
      setSaving(false);
      if (error.message.toLowerCase().includes("contract_number")) {
        setFieldErrors({ contract_number: "Contract number must be unique." });
        setFormError("Please fix the highlighted validation errors before saving.");
        setWizardStep(0);
        return;
      }
      setFormError(error.message);
      return;
    }

    const fieldChanges = diffContractFormValues(baseline, valuesForSave);
    if (fieldChanges.length > 0) {
      await supabase.from("contract_changes").insert(
        fieldChanges.map((change) => ({
          contract_id: contractId,
          field_name: change.field_name,
          previous_value: change.previous_value || null,
          new_value: change.new_value || null,
          change_reason: "Manager updated draft contract",
          changed_by: profileId,
          source: "edit_form",
        }))
      );
    }

    await supabase.from("contract_versions").insert({
      contract_id: contractId,
      version_number: nextVersion,
      change_summary: "Draft updated — not yet sent to executive",
      created_by: profileId,
      snapshot: { changes: fieldChanges },
    });

    setSaving(false);
    router.push("/contracts?status=draft");
    router.refresh();
  }

  async function createAndSendToExecutive() {
    setFormError(null);
    if (!signatureData) {
      setFormError("Draw your signature before sending the contract to the executive.");
      return;
    }
    if (!signatureAck) {
      setFormError("Confirm the electronic signature acknowledgment.");
      return;
    }

    setSaving(true);
    const supabase = createClient();

    let customerIdForSave = values.customer_id;
    if (customerSource === "new") {
      const created = await createCustomerIfNeeded();
      if (created.error || !created.customerId) {
        setFieldErrors({ customer_id: created.error ?? "Enter a customer name." });
        setFormError(created.error ?? "Enter a customer name to continue.");
        setSaving(false);
        return;
      }
      customerIdForSave = created.customerId;
    }

    const valuesForSave: ContractFormValues = {
      ...values,
      customer_id: customerIdForSave,
      status: "pending_approval",
    };

    const customerExists = await verifyCustomerExists(valuesForSave.customer_id);
    const contractNumberUnique = await verifyContractNumberUnique(valuesForSave.contract_number);
    const validation = validateContractFormValues(valuesForSave, {
      customerExists,
      contractNumberUnique,
    });
    if (!validation.ok) {
      setFieldErrors(validation.fieldErrors);
      setFormError(
        validation.formError ||
          "Complete all required fields before sending this contract to the executive."
      );
      setWizardStep(0);
      setSaving(false);
      return;
    }

    const signedAt = new Date().toISOString();
    let targetContractId = contractId ?? "";

    if (mode === "create") {
      const payload = {
        ...contractFormToPayload(valuesForSave, profileId, "create"),
        status: "pending_approval",
      };
      const { data, error } = await supabase
        .from("contracts")
        .insert(payload)
        .select("id")
        .maybeSingle();
      if (error || !data?.id) {
        setSaving(false);
        if (error?.message.toLowerCase().includes("contract_number")) {
          setFieldErrors({ contract_number: "Contract number must be unique." });
          setFormError("Please fix the highlighted validation errors before saving.");
          setWizardStep(0);
          return;
        }
        setFormError(error?.message ?? "Could not create contract.");
        return;
      }
      targetContractId = data.id;

      await consumeContractNumber(valuesForSave.contract_number);

      await supabase.from("contract_versions").insert({
        contract_id: targetContractId,
        version_number: 1,
        change_summary: "Initial agreement version — manager signed for executive review",
        created_by: profileId,
      });
    } else {
      if (!contractId) {
        setFormError("Missing contract id.");
        setSaving(false);
        return;
      }
      const nextVersion = currentVersion + 1;
      const payload = {
        ...contractFormToPayload(valuesForSave, profileId, "edit"),
        status: "pending_approval",
        version_number: nextVersion,
      };
      const { error } = await supabase.from("contracts").update(payload).eq("id", contractId);
      if (error) {
        setSaving(false);
        if (error.message.toLowerCase().includes("contract_number")) {
          setFieldErrors({ contract_number: "Contract number must be unique." });
          setFormError("Please fix the highlighted validation errors before saving.");
          setWizardStep(0);
          return;
        }
        setFormError(error.message);
        return;
      }

      const fieldChanges = diffContractFormValues(baseline, valuesForSave);
      if (fieldChanges.length > 0) {
        await supabase.from("contract_changes").insert(
          fieldChanges.map((change) => ({
            contract_id: contractId,
            field_name: change.field_name,
            previous_value: change.previous_value || null,
            new_value: change.new_value || null,
            change_reason: "Manager completed draft and sent to executive",
            changed_by: profileId,
            source: "edit_form",
          }))
        );
      }

      await supabase.from("contract_versions").insert({
        contract_id: contractId,
        version_number: nextVersion,
        change_summary: "Draft completed — manager signed for executive review",
        created_by: profileId,
        snapshot: { changes: fieldChanges },
      });

      await supabase
        .from("contract_signature_packets")
        .update({ is_current: false, updated_at: signedAt })
        .eq("contract_id", contractId)
        .eq("is_current", true);
    }

    const { data: packet, error: packetError } = await supabase
      .from("contract_signature_packets")
      .insert({
        contract_id: targetContractId,
        status: "awaiting_executive",
        is_current: true,
        created_by: profileId,
        manager_signed_by: profileId,
        manager_signed_at: signedAt,
        manager_signature_data: signatureData,
        manager_signer_name: profileName,
      })
      .select("*")
      .single();

    if (packetError || !packet) {
      setSaving(false);
      setFormError(
        packetError?.message ??
          "Contract saved, but signature packet failed. Open the contract to retry."
      );
      router.push(`/contracts/${targetContractId}`);
      return;
    }

    try {
      const blob = await buildContractPdfBlob({
        contract: pdfContractFromFormValues(valuesForSave, "pending_approval"),
        customerName: customerLabel,
        managerName: managerLabel,
        technicianName:
          technicians.find((t) => t.id === valuesForSave.assigned_technician_id)?.full_name ?? null,
        signatures: packetSignaturesForPdf(packet),
      });
      const path = `${targetContractId}/signature-packets/${packet.id}-${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("contract-documents")
        .upload(path, blob, { contentType: "application/pdf", upsert: true });
      if (!uploadError) {
        await supabase
          .from("contract_signature_packets")
          .update({ storage_path: path, updated_at: signedAt })
          .eq("id", packet.id);
      }
    } catch {
      // Contract + signature already saved; PDF path is optional for queue visibility.
    }

    await supabase.from("contract_changes").insert({
      contract_id: targetContractId,
      field_name: "signature_packet",
      previous_value: "draft",
      new_value: "awaiting_executive",
      change_reason: "Manager signed PDF and sent completed contract to executive",
      changed_by: profileId,
      source: mode === "create" ? "create_wizard" : "edit_form",
    });

    setSaving(false);
    router.push(`/contracts/${targetContractId}#pdf-signatures`);
    router.refresh();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (wizardStep < 3) {
      await goNextStep();
      return;
    }
    if (isDraftWorkflow) {
      await createAndSendToExecutive();
      return;
    }

    setFormError(null);
    setSaving(true);

    const supabase = createClient();
    const valuesForSave = values;
    const customerExists = await verifyCustomerExists(valuesForSave.customer_id);
    const contractNumberUnique = await verifyContractNumberUnique(valuesForSave.contract_number);
    const validation = validateContractFormValues(valuesForSave, {
      customerExists,
      contractNumberUnique,
    });

    if (!validation.ok) {
      setFieldErrors(validation.fieldErrors);
      setFormError(validation.formError);
      setWizardStep(0);
      setSaving(false);
      return;
    }

    if (
      valuesForSave.status === "active" &&
      baseline.status !== "active" &&
      baseline.status !== "on_hold" &&
      baseline.status !== "renewed" &&
      baseline.status !== "expired"
    ) {
      setFieldErrors({ status: "Waiting on customer signature." });
      setFormError(
        "A contract becomes Active only after the manager, executive, and customer have signed (customer acceptance in My Contracts)."
      );
      setSaving(false);
      return;
    }

    const fieldChanges = diffContractFormValues(baseline, values);
    if (fieldChanges.length === 0) {
      setFormError("No changes detected.");
      setSaving(false);
      return;
    }

    const reason = "Manager updated contract terms and resent for executive and customer approval";
    const nextVersion = currentVersion + 1;
    const signedAt = new Date().toISOString();
    const updatePayload = {
      ...contractFormToPayload(values, profileId, mode),
      status: "pending_approval",
      version_number: nextVersion,
    };

    const { error } = await supabase
      .from("contracts")
      .update(updatePayload)
      .eq("id", contractId);

    if (error) {
      setSaving(false);
      if (error.message.toLowerCase().includes("contract_number")) {
        setFieldErrors({ contract_number: "Contract number must be unique." });
        setFormError("Please fix the highlighted validation errors before saving.");
        return;
      }
      setFormError(error.message);
      return;
    }

    const { error: changesError } = await supabase.from("contract_changes").insert(
      fieldChanges.map((change) => ({
        contract_id: contractId,
        field_name: change.field_name,
        previous_value: change.previous_value || null,
        new_value: change.new_value || null,
        change_reason: reason,
        changed_by: profileId,
        source: "edit_form",
      }))
    );
    if (changesError) {
      setFormError(changesError.message);
      setSaving(false);
      return;
    }

    const { error: versionError } = await supabase.from("contract_versions").insert({
      contract_id: contractId,
      version_number: nextVersion,
      change_summary: reason,
      created_by: profileId,
      snapshot: { changes: fieldChanges },
    });
    if (versionError) {
      setFormError(versionError.message);
      setSaving(false);
      return;
    }

    // Restart signature workflow: executive, then customer, must approve the revised terms.
    await supabase
      .from("contract_signature_packets")
      .update({ is_current: false, updated_at: signedAt })
      .eq("contract_id", contractId)
      .eq("is_current", true);

    const managerSignature = buildDemoSignatureDataUrl(profileName || "Emilie Pierson");
    const { data: packet, error: packetError } = await supabase
      .from("contract_signature_packets")
      .insert({
        contract_id: contractId,
        status: "awaiting_executive",
        is_current: true,
        created_by: profileId,
        manager_signed_by: profileId,
        manager_signed_at: signedAt,
        manager_signature_data: managerSignature,
        manager_signer_name: profileName || "Emilie Pierson",
      })
      .select("*")
      .single();

    if (packetError) {
      setFormError(
        packetError.message ||
          "Changes saved, but could not restart executive signature. Open the contract to retry."
      );
      setSaving(false);
      return;
    }

    try {
      const blob = await buildContractPdfBlob({
        contract: pdfContractFromFormValues(values, "pending_approval"),
        customerName: customerLabel,
        managerName: managerLabel,
        technicianName:
          technicians.find((t) => t.id === values.assigned_technician_id)?.full_name ?? null,
        signatures: packetSignaturesForPdf(packet),
      });
      const path = `${contractId}/signature-packets/${packet.id}-${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("contract-documents")
        .upload(path, blob, { contentType: "application/pdf", upsert: true });
      if (!uploadError) {
        await supabase
          .from("contract_signature_packets")
          .update({ storage_path: path, updated_at: signedAt })
          .eq("id", packet.id);
      }
    } catch {
      // Changes and packet already saved; PDF path is optional.
    }

    await supabase.from("contract_changes").insert({
      contract_id: contractId,
      field_name: "signature_packet",
      previous_value: baseline.status,
      new_value: "awaiting_executive",
      change_reason: "Revised contract resent to executive, then customer, for approval",
      changed_by: profileId,
      source: "edit_form",
    });

    // Drop any leftover pending price modifications — re-approval is via signatures now.
    await supabase
      .from("contract_modifications")
      .update({
        approval_status: "rejected",
        notes: "Superseded by manager edit — resent for executive and customer signature",
      })
      .eq("contract_id", contractId)
      .eq("approval_status", "pending");

    setSaving(false);
    router.push(`/contracts/${contractId}/view`);
    router.refresh();
  }

  const coreDetailsSection = (
    <section className="rounded-box border border-base-300 bg-base-100 p-5">
      <h2 className="mb-4 text-center text-sm font-semibold uppercase tracking-wide opacity-60">
        Core details
      </h2>
      <div className={fieldGridClass}>
        <FormField label="Contract number *" error={fieldErrors.contract_number}>
          <input
            className={`${fieldControlClass} ${fieldErrors.contract_number ? "input-error" : ""}`}
            value={values.contract_number}
            onChange={(e) => update("contract_number", e.target.value)}
            placeholder={`${contractNumberPrefix}1001`}
          />
        </FormField>
        <FormField label="Contract name *" error={fieldErrors.name} className="sm:col-span-2">
          <input
            className={`${fieldControlClass} ${fieldErrors.name ? "input-error" : ""}`}
            value={values.name}
            onChange={(e) => update("name", e.target.value)}
          />
        </FormField>
        <FormField label="Customer *" error={fieldErrors.customer_id} className="sm:col-span-2">
          {mode === "create" ? (
            <div className="flex w-full flex-col gap-2">
              <select
                className={`${selectControlClass} ${fieldErrors.customer_id ? "select-error" : ""}`}
                value={customerSource === "new" ? "__new__" : values.customer_id}
                onChange={(e) => {
                  const next = e.target.value;
                  if (next === "__new__") {
                    setCustomerSource("new");
                    update("customer_id", "");
                    return;
                  }
                  setCustomerSource("existing");
                  update("customer_id", next);
                }}
              >
                <option value="">Select a customer</option>
                {customerOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
                <option value="__new__">+ Add new customer…</option>
              </select>
              {customerSource === "new" ? (
                <input
                  className={`${fieldControlClass} ${fieldErrors.customer_id ? "input-error" : ""}`}
                  value={newCustomerName}
                  onChange={(e) => {
                    setNewCustomerName(e.target.value);
                    if (fieldErrors.customer_id) {
                      setFieldErrors((prev) => {
                        const next = { ...prev };
                        delete next.customer_id;
                        return next;
                      });
                    }
                  }}
                  placeholder="Type the new customer name"
                  autoFocus
                />
              ) : null}
            </div>
          ) : (
            <select
              className={`${selectControlClass} ${fieldErrors.customer_id ? "select-error" : ""}`}
              value={values.customer_id}
              onChange={(e) => update("customer_id", e.target.value)}
            >
              <option value="">Select a customer</option>
              {customerOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label="Contract type *">
          <select
            className={selectControlClass}
            value={values.contract_type}
            onChange={(e) => update("contract_type", e.target.value)}
          >
            {CONTRACT_TYPES.map((t) => (
              <option key={t} value={t}>
                {CONTRACT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Status *" error={fieldErrors.status}>
          <select
            className={`${selectControlClass} ${fieldErrors.status ? "select-error" : ""}`}
            value={values.status}
            onChange={(e) => update("status", e.target.value)}
            disabled={mode === "create"}
          >
            {(mode === "create" ? (["draft"] as const) : CONTRACT_STATUSES).map((s) => (
              <option key={s} value={s}>
                {CONTRACT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          {mode === "create" ? (
            <p className="mt-1 text-xs opacity-60">
              After you review and sign, this goes to the executive for signature.
            </p>
          ) : null}
        </FormField>
        <FormField label="Work location *" error={fieldErrors.work_location}>
          <div className="w-full">
            <select
              className={`${selectControlClass} ${fieldErrors.work_location ? "select-error" : ""}`}
              value={values.work_location}
              onChange={(e) => update("work_location", e.target.value)}
            >
              {WORK_LOCATIONS.map((location) => (
                <option key={location} value={location}>
                  {WORK_LOCATION_LABELS[location]}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs opacity-60">
              Remote is billed lower (no travel). On-site is higher because technicians travel to the
              customer site.
            </p>
          </div>
        </FormField>
        <FormField label="Account manager">
          <select
            className={selectControlClass}
            value={values.assigned_manager_id}
            onChange={(e) => update("assigned_manager_id", e.target.value)}
          >
            <option value="">Unassigned</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Sales representative">
          <select
            className={selectControlClass}
            value={values.sales_representative_id}
            onChange={(e) => update("sales_representative_id", e.target.value)}
          >
            <option value="">Unassigned</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Billing contact">
          <input
            className={fieldControlClass}
            value={values.billing_contact}
            onChange={(e) => update("billing_contact", e.target.value)}
            placeholder="Name or email for invoices"
          />
        </FormField>
        <FormField label="Description / notes" className="sm:col-span-2 lg:col-span-3">
          <textarea
            className={textareaControlClass}
            rows={3}
            value={values.description}
            onChange={(e) => update("description", e.target.value)}
          />
        </FormField>
        <FormField label="Scope" className="sm:col-span-2 lg:col-span-3">
          <textarea
            className={textareaControlClass}
            rows={3}
            value={values.scope}
            onChange={(e) => update("scope", e.target.value)}
            placeholder="What work and deliverables this agreement covers"
          />
        </FormField>
      </div>
    </section>
  );

  const datesSection = (
    <section className="rounded-box border border-base-300 bg-base-100 p-5">
      <h2 className="mb-4 text-center text-sm font-semibold uppercase tracking-wide opacity-60">
        Dates & renewal
      </h2>
      <div className={fieldGridClass}>
        <FormField label="Start date *" error={fieldErrors.start_date}>
          <input
            type="date"
            className={`${fieldControlClass} ${fieldErrors.start_date ? "input-error" : ""}`}
            value={values.start_date}
            onChange={(e) => update("start_date", e.target.value)}
          />
        </FormField>
        <FormField label="End date" error={fieldErrors.end_date}>
          <input
            type="date"
            className={`${fieldControlClass} ${fieldErrors.end_date ? "input-error" : ""}`}
            value={values.end_date}
            onChange={(e) => update("end_date", e.target.value)}
          />
        </FormField>
        <FormField label="Effective date">
          <input
            type="date"
            className={fieldControlClass}
            value={values.effective_date}
            onChange={(e) => update("effective_date", e.target.value)}
          />
        </FormField>
        <FormField label="Signed date">
          <input
            type="date"
            className={fieldControlClass}
            value={values.signed_date}
            onChange={(e) => update("signed_date", e.target.value)}
          />
        </FormField>
        <FormField label="Renewal type">
          <select
            className={selectControlClass}
            value={values.renewal_type}
            onChange={(e) => update("renewal_type", e.target.value)}
          >
            {RENEWAL_TYPES.map((r) => (
              <option key={r} value={r}>
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Notice period (days)">
          <input
            type="number"
            min={0}
            className={fieldControlClass}
            value={values.cancellation_notice_days}
            onChange={(e) => update("cancellation_notice_days", e.target.value)}
          />
        </FormField>
        <FormField label="Renewal terms" className="sm:col-span-2 lg:col-span-3">
          <textarea
            className={textareaControlClass}
            rows={2}
            value={values.renewal_terms}
            onChange={(e) => update("renewal_terms", e.target.value)}
          />
        </FormField>
        <FormField label="Cancellation terms" className="sm:col-span-2 lg:col-span-3">
          <textarea
            className={textareaControlClass}
            rows={2}
            value={values.cancellation_terms}
            onChange={(e) => update("cancellation_terms", e.target.value)}
          />
        </FormField>
      </div>
    </section>
  );

  const assignmentBillingSection = (
    <section className="rounded-box border border-base-300 bg-base-100 p-5">
      <h2 className="mb-4 text-center text-sm font-semibold uppercase tracking-wide opacity-60">
        Assignment & billing
      </h2>
      <div className={fieldGridClass}>
        <FormField label="Assigned technician" className="sm:col-span-2 lg:col-span-3">
            <div className="w-full space-y-2">
              {recommendedTechnician ? (
                <div className="rounded-box border border-sky-200 bg-sky-50/80 px-3 py-2 text-sm dark:border-sky-800 dark:bg-sky-950/40">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-sky-800 dark:text-sky-200">
                        Recommended based on specialty &amp; skill level
                      </p>
                      <p className="mt-0.5 font-medium">
                        {recommendedTechnician.full_name}
                        <span className="font-normal opacity-70">
                          {" "}
                          — {recommendedTechnician.primary_specialty ?? "General support"} ·{" "}
                          {skillLevelLabel(recommendedTechnician.skill_level)}
                        </span>
                      </p>
                      <p className="text-xs opacity-60">Fit score {recommendedFit}%</p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-xs shrink-0"
                      onClick={() => update("assigned_technician_id", recommendedTechnician.id)}
                      disabled={values.assigned_technician_id === recommendedTechnician.id}
                    >
                      {values.assigned_technician_id === recommendedTechnician.id
                        ? "Selected"
                        : "Use recommended"}
                    </button>
                  </div>
                </div>
              ) : null}
              <select
                className={selectControlClass}
                value={values.assigned_technician_id}
                onChange={(e) => update("assigned_technician_id", e.target.value)}
              >
                <option value="">Unassigned</option>
                {rankedTechnicians.map(({ tech, fit }) => (
                  <option key={tech.id} value={tech.id}>
                    {fit > 0 ? `★ ${fit}% · ` : ""}
                    {formatTechnicianOptionLabel(tech)}
                    {recommendedTechnician?.id === tech.id ? " (recommended)" : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs opacity-60">
                Optional. Technicians are ranked by how well their specialty and skill level match
                this contract&apos;s type, work location, and covered services
                {selectedTechnician
                  ? `. Currently selected: ${formatTechnicianOptionLabel(selectedTechnician)}.`
                  : "."}
              </p>
            </div>
          </FormField>
        <FormField
          label="Base monthly recurring revenue (MRR) *"
          error={fieldErrors.monthly_recurring_fee}
        >
          <div className="w-full">
            <input
              type="number"
              min={0}
              step="0.01"
              className={`${fieldControlClass} ${fieldErrors.monthly_recurring_fee ? "input-error" : ""}`}
              value={values.monthly_recurring_fee}
              onChange={(e) => update("monthly_recurring_fee", e.target.value)}
            />
            <p className="mt-1 text-xs opacity-60">
              Billed MRR after location:{" "}
              <span className="font-medium tabular-nums">
                {formatCurrency(
                  locationAdjustedAmount(Number(values.monthly_recurring_fee || 0), values.work_location)
                )}
              </span>
              <span className="opacity-80"> · {workLocationAdjustmentLabel(values.work_location)}</span>
            </p>
          </div>
        </FormField>
        <FormField label="One-time setup fee" error={fieldErrors.one_time_setup_fee}>
          <input
            type="number"
            min={0}
            step="0.01"
            className={`${fieldControlClass} ${fieldErrors.one_time_setup_fee ? "input-error" : ""}`}
            value={values.one_time_setup_fee}
            onChange={(e) => update("one_time_setup_fee", e.target.value)}
          />
        </FormField>
        <FormField label="Deposit amount" error={fieldErrors.deposit_amount}>
          <input
            type="number"
            min={0}
            step="0.01"
            className={`${fieldControlClass} ${fieldErrors.deposit_amount ? "input-error" : ""}`}
            value={values.deposit_amount}
            onChange={(e) => update("deposit_amount", e.target.value)}
          />
        </FormField>
        <FormField label="Included support hours *" error={fieldErrors.included_hours_per_month}>
          <input
            type="number"
            min={0}
            step="0.1"
            className={`${fieldControlClass} ${fieldErrors.included_hours_per_month ? "input-error" : ""}`}
            value={values.included_hours_per_month}
            onChange={(e) => update("included_hours_per_month", e.target.value)}
          />
        </FormField>
        <FormField label="Allow overage billing">
          <div className="flex h-10 w-full items-center justify-start rounded-lg border border-base-300 bg-base-100 px-3">
            <input
              type="checkbox"
              className="checkbox checkbox-primary"
              checked={values.overages_allowed}
              onChange={(e) => update("overages_allowed", e.target.checked)}
            />
          </div>
        </FormField>
        <FormField
          label={`Base overage hourly rate${values.overages_allowed ? " *" : ""}`}
          error={fieldErrors.additional_hourly_rate}
        >
          <div className="w-full">
            <input
              type="number"
              min={0}
              step="0.01"
              className={`${fieldControlClass} ${fieldErrors.additional_hourly_rate ? "input-error" : ""}`}
              value={values.additional_hourly_rate}
              onChange={(e) => update("additional_hourly_rate", e.target.value)}
              disabled={!values.overages_allowed}
            />
            {values.overages_allowed ? (
              <p className="mt-1 text-xs opacity-60">
                Billed hourly rate after location:{" "}
                <span className="font-medium tabular-nums">
                  {formatCurrency(
                    locationAdjustedAmount(
                      Number(values.additional_hourly_rate || 0),
                      values.work_location
                    )
                  )}
                  /hr
                </span>
              </p>
            ) : null}
          </div>
        </FormField>
        <FormField label="Overage charges (accrued)" error={fieldErrors.overage_charges}>
          <input
            type="number"
            min={0}
            step="0.01"
            className={`${fieldControlClass} ${fieldErrors.overage_charges ? "input-error" : ""}`}
            value={values.overage_charges}
            onChange={(e) => update("overage_charges", e.target.value)}
            disabled={!values.overages_allowed}
          />
        </FormField>
        <FormField label="Billing frequency">
          <select
            className={selectControlClass}
            value={values.billing_frequency}
            onChange={(e) => update("billing_frequency", e.target.value)}
          >
            {BILLING_FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {f.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Billing timing">
          <select
            className={selectControlClass}
            value={values.billing_timing}
            onChange={(e) => update("billing_timing", e.target.value)}
          >
            {BILLING_TIMINGS.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Billing method">
          <select
            className={selectControlClass}
            value={values.billing_method}
            onChange={(e) => update("billing_method", e.target.value)}
          >
            {Array.from(
              new Set([values.billing_method, ...BILLING_METHOD_OPTIONS].filter(Boolean))
            ).map((m) => (
              <option key={m} value={m}>
                {String(m).replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Invoice / payment terms">
          <input
            className={fieldControlClass}
            value={values.payment_terms}
            onChange={(e) => update("payment_terms", e.target.value)}
            placeholder="Net 30"
          />
        </FormField>
        <FormField label="Billing status" error={fieldErrors.billing_status}>
          <select
            className={selectControlClass}
            value={values.billing_status}
            onChange={(e) => update("billing_status", e.target.value)}
          >
            {CONTRACT_BILLING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CONTRACT_BILLING_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Next invoice date">
          <input
            type="date"
            className={fieldControlClass}
            value={values.next_invoice_date}
            onChange={(e) => update("next_invoice_date", e.target.value)}
          />
        </FormField>
        <FormField label="Last invoice date">
          <input
            type="date"
            className={fieldControlClass}
            value={values.last_invoice_date}
            onChange={(e) => update("last_invoice_date", e.target.value)}
          />
        </FormField>
        <FormField label="Software markup %" error={fieldErrors.software_markup_pct}>
          <input
            type="number"
            min={0}
            step="0.01"
            className={`${fieldControlClass} ${fieldErrors.software_markup_pct ? "input-error" : ""}`}
            value={values.software_markup_pct}
            onChange={(e) => update("software_markup_pct", e.target.value)}
            placeholder="e.g. 15"
          />
        </FormField>
        <FormField label="Equipment markup %" error={fieldErrors.equipment_markup_pct}>
          <input
            type="number"
            min={0}
            step="0.01"
            className={`${fieldControlClass} ${fieldErrors.equipment_markup_pct ? "input-error" : ""}`}
            value={values.equipment_markup_pct}
            onChange={(e) => update("equipment_markup_pct", e.target.value)}
            placeholder="e.g. 20"
          />
        </FormField>
        <FormField label="Reimbursable cost policy" className="sm:col-span-2 lg:col-span-3">
          <textarea
            className={textareaControlClass}
            rows={2}
            value={values.reimbursable_cost_policy}
            onChange={(e) => update("reimbursable_cost_policy", e.target.value)}
            placeholder="How pass-through and reimbursable costs are handled"
          />
        </FormField>
      </div>
    </section>
  );

  const coverageSection = (
    <section className="rounded-box border border-base-300 bg-base-100 p-5">
      <h2 className="mb-4 text-center text-sm font-semibold uppercase tracking-wide opacity-60">
        Coverage & SLA
      </h2>
      <div className={fieldGridClass}>
        <FormField label="After-hours terms" className="sm:col-span-2 lg:col-span-3">
          <textarea
            className={textareaControlClass}
            rows={2}
            value={values.after_hours_terms}
            onChange={(e) => update("after_hours_terms", e.target.value)}
            placeholder="After-hours coverage, rates, or response expectations"
          />
        </FormField>
        <FormField label="SLA level">
          <select
            className={selectControlClass}
            value={selectedSlaLevel}
            onChange={(e) =>
              setSelectedSlaLevel(e.target.value as "critical" | "high" | "medium" | "low")
            }
          >
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </FormField>
        <FormField label="Response hours" error={fieldErrors[slaHoursFieldKey[selectedSlaLevel]]}>
          <input
            type="text"
            inputMode="decimal"
            className={fieldControlClass}
            value={values[slaHoursFieldKey[selectedSlaLevel]]}
            onChange={(e) => {
              const next = e.target.value;
              if (next === "" || /^\d*\.?\d*$/.test(next)) {
                update(slaHoursFieldKey[selectedSlaLevel], next);
              }
            }}
            placeholder="Hours"
          />
        </FormField>
        <FormField label="Covered sites / locations" className="sm:col-span-2 lg:col-span-3">
          <input
            className={fieldControlClass}
            value={values.supported_locations}
            onChange={(e) => update("supported_locations", e.target.value)}
          />
        </FormField>
        <FormField label="Covered devices / users" className="sm:col-span-2 lg:col-span-3">
          <input
            className={fieldControlClass}
            value={values.supported_users_devices}
            onChange={(e) => update("supported_users_devices", e.target.value)}
          />
        </FormField>
        <FormField label="Covered services" className="sm:col-span-2 lg:col-span-3">
          <ServiceChecklist
            options={CONTRACT_COVERED_SERVICE_OPTIONS}
            selected={coveredServicesSelected}
            onToggle={(option) => toggleService("included_services", option)}
          />
        </FormField>
        <FormField label="Excluded services" className="sm:col-span-2 lg:col-span-3">
          <ServiceChecklist
            options={CONTRACT_EXCLUDED_SERVICE_OPTIONS}
            selected={excludedServicesSelected}
            onToggle={(option) => toggleService("excluded_services", option)}
          />
        </FormField>
      </div>
    </section>
  );

  const reviewSection = (
    <section className="space-y-4 rounded-box border border-base-300 bg-base-100 p-5">
      <h2 className="text-center text-sm font-semibold uppercase tracking-wide opacity-60">
        {isDraftWorkflow ? "Review & send" : "Review & save"}
      </h2>
      <p className="text-center text-sm opacity-70">
        {isDraftWorkflow
          ? "Save an incomplete draft for later, or sign and send only when the contract is complete. Drafts appear under Manage Contracts."
          : "Preview the updated agreement PDF below (regenerated from your edits), then save. Changes are resent to the executive for approval, then to the customer."}
      </p>

      <div className="rounded-box border border-base-300 bg-base-200/40 p-4 text-sm">
        <dl className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="opacity-60">Contract</dt>
            <dd className="font-medium">
              {values.contract_number} · {values.name || "—"}
            </dd>
          </div>
          <div>
            <dt className="opacity-60">Customer</dt>
            <dd className="font-medium">{customerLabel}</dd>
          </div>
          <div>
            <dt className="opacity-60">Technician</dt>
            <dd className="font-medium">
              {selectedTechnician
                ? formatTechnicianOptionLabel(selectedTechnician)
                : "Unassigned"}
            </dd>
          </div>
          <div>
            <dt className="opacity-60">Billed MRR</dt>
            <dd className="font-medium tabular-nums">
              {formatCurrency(
                locationAdjustedAmount(Number(values.monthly_recurring_fee || 0), values.work_location)
              )}
            </dd>
          </div>
        </dl>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Updated contract PDF</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={!previewUrl || saving}
            onClick={() => {
              if (!previewUrl) return;
              void (async () => {
                const blob = await buildContractPdfBlob({
                  contract: pdfContractFromFormValues(
                    values,
                    isDraftWorkflow ? "draft" : "pending_approval"
                  ),
                  customerName: customerLabel,
                  managerName: managerLabel,
                  technicianName: selectedTechnician?.full_name ?? null,
                  signatures: packetSignaturesForPdf(null),
                });
                downloadPdfBlob(blob, `${values.contract_number || "contract"}-agreement.pdf`);
              })();
            }}
          >
            Download PDF
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={saving}
            onClick={() => {
              setPreviewUrl(null);
              setPdfRefreshKey((key) => key + 1);
            }}
          >
            Regenerate PDF
          </button>
        </div>
      </div>

      {previewUrl ? (
        <iframe
          title="Contract PDF preview"
          src={previewUrl}
          className="h-[28rem] w-full rounded-box border border-base-300 bg-white"
        />
      ) : (
        <p className="text-sm opacity-60">Building PDF preview…</p>
      )}

      {isDraftWorkflow ? (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Manager signature</h3>
          <p className="text-sm opacity-70">
            Required only when sending a completed contract to the executive. Skip this if you are
            saving a draft.
          </p>
          <SignaturePad
            onChange={setSignatureData}
            disabled={saving}
            autoPopulateName="Emilie Pierson"
          />
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="checkbox checkbox-primary mt-0.5"
              checked={signatureAck}
              onChange={(e) => setSignatureAck(e.target.checked)}
              disabled={saving}
            />
            <span>
              I confirm this electronic signature as {profileName} (Manager) and send this completed
              agreement to the executive.
            </span>
          </label>
        </div>
      ) : (
        <p className="rounded-box border border-info/30 bg-info/10 p-3 text-sm opacity-80">
          Saving applies your updates and places this contract back in the executive signature queue.
          After the executive signs, the customer must accept the revised agreement in My Contracts.
        </p>
      )}
    </section>
  );

  return (
    <form className="mx-auto w-full max-w-5xl space-y-6" onSubmit={onSubmit} noValidate>
      <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-end sm:justify-between sm:text-left">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm opacity-70">
            {isDraftWorkflow
              ? "Work through each step at your own pace. Save a draft anytime, or sign and send only when the contract is complete."
              : "Complete each step, then review the PDF and save your changes."}
          </p>
        </div>
      </div>

      <ol className="grid gap-2 sm:grid-cols-4">
        {wizardSteps.map((step, index) => {
          const active = index === wizardStep;
          const done = index < wizardStep;
          return (
            <li
              key={step.id}
              className={`rounded-box border px-3 py-2 text-left text-sm ${
                active
                  ? "border-primary bg-primary/10 font-medium"
                  : done
                    ? "border-base-300 bg-base-200/50"
                    : "border-base-300 opacity-60"
              }`}
            >
              <span className="block text-xs uppercase tracking-wide opacity-60">
                Step {index + 1}
              </span>
              {step.label}
            </li>
          );
        })}
      </ol>

      {formError ? <div className="alert alert-error text-sm">{formError}</div> : null}

      {isActiveContract ? (
        <section className="rounded-box border border-warning bg-warning/10 p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">
            Warning: active contract
          </h2>
          <p className="text-sm opacity-80">
            This agreement is live. Saving your edits will move it back to pending approval so the
            executive and customer can re-approve the revised terms before it becomes active again.
          </p>
        </section>
      ) : null}

      {wizardStep === 0 ? (
        <>
          {coreDetailsSection}
          {datesSection}
        </>
      ) : null}
      {wizardStep === 1 ? assignmentBillingSection : null}
      {wizardStep === 2 ? coverageSection : null}
      {wizardStep === 3 ? reviewSection : null}

      <div className="flex flex-wrap justify-center gap-2">
        <Link href={cancelHref} className="btn btn-ghost">
          Cancel
        </Link>
        {wizardStep > 0 ? (
          <button
            type="button"
            className="btn btn-outline"
            disabled={saving}
            onClick={() => {
              setFormError(null);
              setWizardStep((step) => Math.max(0, step - 1));
            }}
          >
            Back
          </button>
        ) : null}
        {wizardStep < 3 ? (
          <>
            {isDraftWorkflow ? (
              <button
                type="button"
                className="btn btn-outline"
                disabled={saving}
                onClick={() => void saveAsDraft()}
              >
                {saving ? "Saving…" : "Save draft"}
              </button>
            ) : null}
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Checking…" : "Next"}
            </button>
          </>
        ) : isDraftWorkflow ? (
          <>
            <button
              type="button"
              className="btn btn-outline"
              disabled={saving}
              onClick={() => void saveAsDraft()}
            >
              {saving ? "Saving…" : "Save draft"}
            </button>
            <button type="submit" className="btn btn-primary" disabled={!canCreateAndSend}>
              {saving ? "Sending…" : "Send to executive"}
            </button>
          </>
        ) : (
          <button type="submit" className="btn btn-primary" disabled={!canSaveEdit}>
            {saving ? "Saving…" : "Save & send for approval"}
          </button>
        )}
      </div>
    </form>
  );
}
