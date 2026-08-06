import { jsPDF } from "jspdf";
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

/**
 * Build a ServiceSync contract PDF from agreement fields and optional signature images.
 */
export async function buildContractPdfBlob(input: ContractPdfInput): Promise<Blob> {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;
  let y = margin;

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

  field("Contract number", input.contract.contract_number);
  field("Agreement name", input.contract.name);
  field("Customer", input.customerName);
  field("Account manager", input.managerName ?? "—");
  field("Contract type", String(input.contract.contract_type).replace(/_/g, " "));
  field("Work location", String(input.contract.work_location ?? "—").replace(/_/g, " "));
  field("Term", `${fmtDate(input.contract.start_date)} – ${fmtDate(input.contract.end_date)}`);
  field("Base monthly recurring fee", money(input.contract.monthly_recurring_fee));
  if (input.contract.work_location === "remote" || input.contract.work_location === "on_site") {
    const multiplier = input.contract.work_location === "on_site" ? 1.15 : 0.92;
    const billed = Math.round(Number(input.contract.monthly_recurring_fee ?? 0) * multiplier * 100) / 100;
    field(
      "Billed monthly fee",
      `${money(billed)} (${input.contract.work_location === "on_site" ? "on-site +15%" : "remote −8%"})`
    );
  }
  field("Included hours / month", String(input.contract.included_hours_per_month ?? 0));
  field("Additional hourly rate", `${money(input.contract.additional_hourly_rate)}/hr`);
  field("Billing frequency", String(input.contract.billing_frequency ?? "—").replace(/_/g, " "));
  field("Payment terms", input.contract.payment_terms ?? "—");
  if (input.contract.sla_response_hours != null) {
    field("SLA response", `${input.contract.sla_response_hours} hours`);
  }
  if (input.contract.sla_resolution_hours != null) {
    field("SLA resolution", `${input.contract.sla_resolution_hours} hours`);
  }

  y += 8;
  line("Scope & services", { bold: true, size: 12 });
  line(input.contract.scope || input.contract.description || "As defined in the ServiceSync contract record.");
  if (input.contract.included_services) {
    y += 4;
    line("Included services", { bold: true, size: 11 });
    line(input.contract.included_services);
  }

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
  // Revoke after print dialog is likely done / window closed.
  win.addEventListener("afterprint", revoke);
  setTimeout(revoke, 60_000);
}
