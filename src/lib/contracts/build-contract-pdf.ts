import type { ContractPdfInput } from "./signature-packets";

function money(n: number | null | undefined) {
  return `$${Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function fmtDateTime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function labelize(value: string | null | undefined) {
  if (!value) return "—";
  return String(value).replace(/_/g, " ");
}

/**
 * Build a ServiceSync contract PDF from agreement fields and optional signature images.
 * Always uses the current contract field values passed in (regenerate after edits).
 * jspdf is loaded dynamically so missing installs fail at PDF time, not page load.
 */
export async function buildContractPdfBlob(input: ContractPdfInput): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;
  let y = margin;
  const c = input.contract;

  const ensureSpace = (needed: number) => {
    if (y + needed > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const line = (text: string, options?: { bold?: boolean; size?: number; color?: [number, number, number] }) => {
    ensureSpace(18);
    doc.setFont("helvetica", options?.bold ? "bold" : "normal");
    doc.setFontSize(options?.size ?? 11);
    if (options?.color) doc.setTextColor(...options.color);
    else doc.setTextColor(20, 20, 20);
    const lines = doc.splitTextToSize(text, pageWidth - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * ((options?.size ?? 11) + 4);
  };

  const field = (label: string, value: string) => {
    ensureSpace(16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(90, 90, 90);
    doc.text(label, margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(20, 20, 20);
    const lines = doc.splitTextToSize(value || "—", pageWidth - margin * 2 - 140);
    doc.text(lines, margin + 140, y);
    y += Math.max(14, lines.length * 13);
  };

  line("ServiceSync MSP", { bold: true, size: 18 });
  line("Managed Service Agreement", { bold: true, size: 14 });
  y += 6;
  doc.setDrawColor(180, 180, 180);
  doc.line(margin, y, pageWidth - margin, y);
  y += 16;

  field("Contract number", c.contract_number);
  field("Agreement name", c.name);
  field("Customer", input.customerName);
  field("Account manager", input.managerName ?? "—");
  field("Assigned technician", input.technicianName ?? "—");
  field("Contract type", labelize(String(c.contract_type)));
  field("Work location", labelize(c.work_location));
  field("Effective date", fmtDate(c.effective_date ?? c.start_date));
  field("Term", `${fmtDate(c.start_date)} – ${fmtDate(c.end_date)}`);
  field("Base monthly recurring fee", money(c.monthly_recurring_fee));
  if (c.work_location === "remote" || c.work_location === "on_site") {
    const multiplier = c.work_location === "on_site" ? 1.15 : 0.92;
    const billed = Math.round(Number(c.monthly_recurring_fee ?? 0) * multiplier * 100) / 100;
    field(
      "Billed monthly fee",
      `${money(billed)} (${c.work_location === "on_site" ? "on-site +15%" : "remote −8%"})`
    );
  }
  field("One-time setup fee", money(c.one_time_setup_fee));
  field("Included hours / month", String(c.included_hours_per_month ?? 0));
  field("Additional hourly rate", `${money(c.additional_hourly_rate)}/hr`);
  field("Overages allowed", c.overages_allowed ? "Yes" : "No");
  field("Billing frequency", labelize(c.billing_frequency));
  field("Billing method", c.billing_method ?? "—");
  field("Payment terms", c.payment_terms ?? "—");
  field("Billing contact", c.billing_contact ?? "—");
  field("Renewal type", labelize(c.renewal_type));
  if (c.renewal_terms) field("Renewal terms", c.renewal_terms);
  if (c.cancellation_notice_days != null) {
    field("Cancellation notice", `${c.cancellation_notice_days} days`);
  }
  if (c.cancellation_terms) field("Cancellation terms", c.cancellation_terms);

  if (c.sla_critical_response_hours != null || c.sla_response_hours != null) {
    y += 4;
    line("Service levels", { bold: true, size: 12 });
    if (c.sla_critical_response_hours != null) field("Critical response", `${c.sla_critical_response_hours} hours`);
    if (c.sla_high_response_hours != null) field("High response", `${c.sla_high_response_hours} hours`);
    if (c.sla_medium_response_hours != null) field("Medium response", `${c.sla_medium_response_hours} hours`);
    if (c.sla_low_response_hours != null) field("Low response", `${c.sla_low_response_hours} hours`);
    if (c.sla_response_hours != null) field("Overall response", `${c.sla_response_hours} hours`);
    if (c.sla_resolution_hours != null) field("Overall resolution", `${c.sla_resolution_hours} hours`);
  }

  y += 8;
  line("Scope & services", { bold: true, size: 12 });
  line(c.scope || c.description || "As defined in the ServiceSync contract record.");
  if (c.included_services) {
    y += 4;
    line("Included services", { bold: true, size: 11 });
    line(c.included_services);
  }
  if (c.excluded_services) {
    y += 4;
    line("Excluded services", { bold: true, size: 11 });
    line(c.excluded_services);
  }
  if (c.supported_locations) field("Supported locations", c.supported_locations);
  if (c.supported_users_devices) field("Supported users / devices", c.supported_users_devices);
  if (c.after_hours_terms) field("After-hours terms", c.after_hours_terms);

  y += 12;
  line("Signatures", { bold: true, size: 12 });
  line(
    "This agreement is signed electronically by the Account Manager, Executive (CEO), and Customer in ServiceSync.",
    { size: 9, color: [90, 90, 90] }
  );
  y += 8;

  const drawSignature = async (
    title: string,
    sig: { name: string; signedAt: string; imageDataUrl: string } | null | undefined,
    emptyLabel = "Awaiting signature"
  ) => {
    ensureSpace(110);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(20, 20, 20);
    doc.text(title, margin, y);
    y += 14;
    doc.setDrawColor(200, 200, 200);
    doc.rect(margin, y, 220, 56);
    if (sig?.imageDataUrl) {
      try {
        doc.addImage(sig.imageDataUrl, "PNG", margin + 8, y + 6, 200, 44);
      } catch {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(10);
        doc.text("(signature on file)", margin + 12, y + 32);
      }
      y += 66;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`${sig.name} · ${fmtDateTime(sig.signedAt)}`, margin, y);
      y += 18;
    } else {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.setTextColor(140, 140, 140);
      doc.text(emptyLabel, margin + 12, y + 32);
      y += 72;
    }
  };

  await drawSignature("1. Account Manager", input.signatures.manager);
  await drawSignature("2. CEO / Executive", input.signatures.executive);
  await drawSignature("3. Customer", input.signatures.customer);

  y += 8;
  line(`Generated by ServiceSync · ${fmtDateTime(new Date().toISOString())}`, {
    size: 8,
    color: [120, 120, 120],
  });

  return doc.output("blob");
}

export function downloadPdfBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Open the PDF in a new window and trigger the browser print dialog. */
export function printPdfBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const win = window.open(url);
  if (!win) {
    URL.revokeObjectURL(url);
    throw new Error("Pop-up blocked. Allow pop-ups to print this agreement.");
  }
  const revoke = () => URL.revokeObjectURL(url);
  win.addEventListener("load", () => {
    win.focus();
    win.print();
  });
  win.addEventListener("afterprint", revoke);
  setTimeout(revoke, 60_000);
}
