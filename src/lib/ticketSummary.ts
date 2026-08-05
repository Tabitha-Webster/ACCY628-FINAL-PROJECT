/**
 * Customer-visible ticket resolution summary generation.
 * Server-only helpers — never import API keys into client components.
 */

export const SUMMARY_MAX_INPUT_CHARS = 6000;
export const SUMMARY_MAX_OUTPUT_SENTENCES = 3;

export type SummaryTicketInput = {
  title: string;
  description: string | null;
  service_category: string | null;
  status: string | null;
  technician_notes: string | null;
  completion_notes: string | null;
  work_descriptions: string[];
};

export function collectSummarySourceText(ticket: SummaryTicketInput) {
  const parts = [
    ticket.title?.trim(),
    ticket.description?.trim(),
    ticket.service_category ? `Category: ${ticket.service_category}` : null,
    ticket.status ? `Status: ${ticket.status}` : null,
    ticket.technician_notes?.trim(),
    ticket.completion_notes?.trim(),
    ...ticket.work_descriptions.map((d) => d.trim()).filter(Boolean),
  ].filter((v): v is string => Boolean(v));

  const joined = parts.join("\n\n");
  return joined.length > SUMMARY_MAX_INPUT_CHARS
    ? joined.slice(0, SUMMARY_MAX_INPUT_CHARS)
    : joined;
}

export function hasEnoughNotesForSummary(ticket: SummaryTicketInput) {
  const notes = [
    ticket.technician_notes,
    ticket.completion_notes,
    ...ticket.work_descriptions,
  ]
    .map((v) => v?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
  return notes.replace(/\s+/g, " ").trim().length >= 20;
}

/** Strip credential-like phrases from model output (defense in depth). */
export function sanitizeCustomerSummary(text: string) {
  let out = text.replace(/\s+/g, " ").trim();
  out = out.replace(/\b(password|passwd|secret|api[_ ]?key|token|credential)s?\b[:\s]*\S+/gi, "[redacted]");
  // Keep to ~3 sentences
  const sentences = out.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length > SUMMARY_MAX_OUTPUT_SENTENCES) {
    out = sentences.slice(0, SUMMARY_MAX_OUTPUT_SENTENCES).join(" ");
  }
  return out;
}

/**
 * Development / offline fallback — clearly not a model call.
 * Builds a plain customer-facing draft from documented work text only.
 */
export function buildFallbackCustomerSummary(ticket: SummaryTicketInput) {
  const workBits = [
    ticket.technician_notes,
    ticket.completion_notes,
    ...ticket.work_descriptions,
  ]
    .map((v) => v?.trim() ?? "")
    .filter(Boolean)
    .join(" ");

  const cleaned = workBits
    .replace(/\b(password|passwd|secret|api[_ ]?key|token|credential)s?\b[:\s]*\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const short =
    cleaned.length > 280 ? `${cleaned.slice(0, 277).replace(/\s+\S*$/, "")}…` : cleaned;

  const category = ticket.service_category?.trim();
  const lead = category
    ? `Our technician addressed your ${category.toLowerCase()} request`
    : "Our technician addressed your support request";

  const draft = short
    ? `${lead}. Work performed included: ${short}. Please reply if you still need help.`
    : `${lead} related to “${ticket.title}”. Please reply if you still need help.`;

  return sanitizeCustomerSummary(draft);
}

export function buildSummarySystemPrompt() {
  return [
    "You write short customer-visible IT support resolution summaries for a managed service provider.",
    "Use plain professional language a nontechnical customer can understand.",
    "Explain what was done and the result in 1–3 sentences.",
    "Do not invent work that is not in the notes.",
    "Do not mention passwords, secrets, credentials, keys, internal costs, billing, or employee opinions.",
    "Do not blame the customer or claim a permanent fix unless the notes clearly support that.",
    "Do not include ticket numbers, internal IDs, or technical jargon when a plain phrase works.",
    "Return only the summary text with no quotes or labels.",
  ].join(" ");
}

export async function generateWithOpenAI(input: {
  apiKey: string;
  model: string;
  sourceText: string;
  timeoutMs?: number;
}): Promise<{ summary: string; model: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 25000);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.model,
        temperature: 0.3,
        max_tokens: 220,
        messages: [
          { role: "system", content: buildSummarySystemPrompt() },
          {
            role: "user",
            content: `Create a customer-friendly resolution summary from these technician notes only:\n\n${input.sourceText}`,
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`AI provider error (${res.status}): ${errText.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      model?: string;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("AI provider returned an empty summary.");
    return {
      summary: sanitizeCustomerSummary(content),
      model: data.model ?? input.model,
    };
  } finally {
    clearTimeout(timeout);
  }
}
