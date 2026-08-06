import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import {
  answerHelpWithoutAi,
  buildHelpSystemPrompt,
  loadHelpContextForProfile,
  type HelpChatMessage,
} from "@/lib/help-chat";
import type { UserRole } from "@/lib/constants";

type Body = {
  message?: string;
  history?: HelpChatMessage[];
};

const MAX_MESSAGE = 800;
const MAX_HISTORY = 8;

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }
  if (!profile.is_active) {
    return NextResponse.json({ error: "This account is inactive." }, { status: 403 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const message = (body.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "Enter a question." }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE) {
    return NextResponse.json({ error: "That question is too long." }, { status: 400 });
  }

  // Ignore any client-supplied identity fields — context is always from the session profile.
  const context = await loadHelpContextForProfile(profile);
  const history = Array.isArray(body.history)
    ? body.history
        .filter(
          (row): row is HelpChatMessage =>
            !!row &&
            (row.role === "user" || row.role === "assistant") &&
            typeof row.content === "string"
        )
        .slice(-MAX_HISTORY)
        .map((row) => ({
          role: row.role,
          content: row.content.trim().slice(0, MAX_MESSAGE),
        }))
    : [];

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_SUMMARY_MODEL?.trim() || "gpt-4o-mini";

  if (!apiKey) {
    return NextResponse.json({
      reply: answerHelpWithoutAi(message, context, profile.role as UserRole),
      source: "rules",
    });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 350,
        messages: [
          { role: "system", content: buildHelpSystemPrompt(context) },
          ...history.map((row) => ({ role: row.role, content: row.content })),
          { role: "user", content: message },
        ],
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("help-chat provider error", res.status, errText.slice(0, 200));
      return NextResponse.json({
        reply: answerHelpWithoutAi(message, context, profile.role as UserRole),
        source: "rules",
      });
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      return NextResponse.json({
        reply: answerHelpWithoutAi(message, context, profile.role as UserRole),
        source: "rules",
      });
    }

    return NextResponse.json({ reply, source: "ai" });
  } catch (error) {
    console.error("help-chat failed", error);
    return NextResponse.json({
      reply: answerHelpWithoutAi(message, context, profile.role as UserRole),
      source: "rules",
    });
  }
}
