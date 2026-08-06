"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { Send, X } from "lucide-react";

type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

const STARTER =
  "Hi! Welcome to ServiceSync Help. Ask me anything about your account—balances, requests, contracts—or how to get somewhere in the app.";

export function HelpChatBubble() {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([{ role: "assistant", content: STARTER }]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    inputRef.current?.focus();
  }, [open, turns, loading]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || loading) return;

    setError(null);
    setInput("");
    const history = turns.slice(-8);
    setTurns((prev) => [...prev, { role: "user", content: message }]);
    setLoading(true);

    try {
      const res = await fetch("/api/help-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        reply?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error || "Something went wrong. Try again.");
        setTurns((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.error || "I could not answer that right now. Please try again.",
          },
        ]);
        return;
      }
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply?.trim() || "I could not find an answer in your account context.",
        },
      ]);
    } catch {
      setError("Network error. Try again.");
      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: "Network error. Please try again in a moment." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[70] flex flex-col items-end gap-3">
      {open ? (
        <section
          id={panelId}
          className="pointer-events-auto flex h-[min(28rem,70vh)] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-2xl shadow-base-content/15"
          aria-label="Help chat"
        >
          <header className="flex items-center justify-between gap-2 border-b border-base-300 bg-primary px-3 py-2.5 text-primary-content">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Help</p>
              <p className="truncate text-[11px] opacity-80">Account answers &amp; navigation help</p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-xs text-primary-content"
              onClick={() => setOpen(false)}
              aria-label="Close help chat"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="flex-1 space-y-2.5 overflow-y-auto bg-base-200/40 p-3">
            {turns.map((turn, index) => (
              <div
                key={`${turn.role}-${index}`}
                className={`flex ${turn.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                    turn.role === "user"
                      ? "rounded-br-md bg-primary text-primary-content"
                      : "rounded-bl-md border border-base-300 bg-base-100"
                  }`}
                >
                  {turn.content}
                </div>
              </div>
            ))}
            {loading ? (
              <p className="text-xs opacity-60">Thinking…</p>
            ) : null}
            {error ? <p className="text-xs text-error">{error}</p> : null}
            <div ref={bottomRef} />
          </div>

          <form className="border-t border-base-300 bg-base-100 p-2.5" onSubmit={onSubmit}>
            <label className="sr-only" htmlFor={`${panelId}-input`}>
              Ask a question
            </label>
            <div className="flex items-end gap-2">
              <textarea
                id={`${panelId}-input`}
                ref={inputRef}
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about your balance, tickets, contracts…"
                className="textarea textarea-bordered textarea-sm min-h-[2.75rem] flex-1 resize-none"
                maxLength={800}
                disabled={loading}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void onSubmit(e as unknown as FormEvent);
                  }
                }}
              />
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={loading || !input.trim()}
                aria-label="Send question"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <button
        type="button"
        className="pointer-events-auto flex size-14 items-center justify-center rounded-full border border-primary/30 bg-primary text-2xl font-semibold text-primary-content shadow-lg shadow-primary/30 transition hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={open ? "Close help chat" : "Open help chat"}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X className="h-6 w-6" /> : <span aria-hidden>?</span>}
      </button>
    </div>
  );
}
