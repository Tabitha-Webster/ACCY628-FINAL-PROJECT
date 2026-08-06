"use client";

import {
  FormEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Send, X } from "lucide-react";
import { helpChatSuggestionsForRole } from "@/lib/help-chat-suggestions";
import type { UserRole } from "@/lib/constants";

type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

const STARTER =
  "Hi! Welcome to ServiceSync Help. Pick a suggested question below, or type your own—about balances, requests, contracts, or how to get somewhere in the app.";

const STORAGE_KEY = "servicesync-help-chat-top-v1";
const BUTTON_SIZE = 56;
const EDGE_PAD = 20;
/** Keep clear of the shared app header */
const HEADER_SAFE_TOP = 72;
const DRAG_THRESHOLD_PX = 6;
const MOBILE_MAX_WIDTH = 640;

function defaultTop(viewportHeight: number) {
  return Math.max(HEADER_SAFE_TOP, viewportHeight - EDGE_PAD - BUTTON_SIZE);
}

function clampTop(top: number, viewportHeight: number) {
  const min = HEADER_SAFE_TOP;
  const max = Math.max(min, viewportHeight - EDGE_PAD - BUTTON_SIZE);
  return Math.min(max, Math.max(min, top));
}

function readStoredTop(viewportHeight: number): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw == null) return defaultTop(viewportHeight);
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) return defaultTop(viewportHeight);
    return clampTop(parsed, viewportHeight);
  } catch {
    return defaultTop(viewportHeight);
  }
}

function persistTop(top: number) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(Math.round(top)));
  } catch {
    // Ignore private browsing / quota failures.
  }
}

function isMobileViewport() {
  return typeof window !== "undefined" && window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`).matches;
}

export function HelpChatBubble({ role }: { role?: UserRole }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([{ role: "assistant", content: STARTER }]);
  const [top, setTop] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [mobileFixed, setMobileFixed] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    startTop: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);

  const suggestions = helpChatSuggestionsForRole(role ?? "customer");
  const showSuggestions = !loading && turns.every((t) => t.role === "assistant");

  const reclamp = useCallback(() => {
    const mobile = isMobileViewport();
    setMobileFixed(mobile);
    if (mobile) {
      setTop(null);
      return;
    }
    const vh = window.innerHeight;
    setTop((prev) => clampTop(prev ?? readStoredTop(vh), vh));
  }, []);

  useEffect(() => {
    reclamp();
    window.addEventListener("resize", reclamp);
    return () => window.removeEventListener("resize", reclamp);
  }, [reclamp]);

  useEffect(() => {
    if (!open) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    inputRef.current?.focus();
  }, [open, turns, loading]);

  function onPointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    if (mobileFixed || e.button !== 0) return;
    const currentTop = top ?? defaultTop(window.innerHeight);
    dragRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startTop: currentTop,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId || mobileFixed) return;

    const deltaY = e.clientY - drag.startY;
    if (!drag.moved && Math.abs(deltaY) < DRAG_THRESHOLD_PX) return;

    drag.moved = true;
    setDragging(true);
    const next = clampTop(drag.startTop + deltaY, window.innerHeight);
    setTop(next);
  }

  function endDrag(e: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    if (drag.moved) {
      suppressClickRef.current = true;
      const next = clampTop(drag.startTop + (e.clientY - drag.startY), window.innerHeight);
      setTop(next);
      persistTop(next);
    }

    dragRef.current = null;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Pointer may already be released.
    }
  }

  function onBubbleClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setOpen((value) => !value);
  }

  async function sendMessage(rawMessage: string) {
    const message = rawMessage.trim();
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

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await sendMessage(input);
  }

  const positionStyle =
    mobileFixed || top == null
      ? undefined
      : ({
          top: `${top}px`,
          bottom: "auto",
          transition: dragging ? "none" : "top 180ms ease",
        } as const);

  return (
    <div
      className={`pointer-events-none fixed right-5 z-[70] ${
        mobileFixed || top == null ? "bottom-5" : ""
      }`}
      style={positionStyle}
    >
      <div className="relative flex flex-col items-end">
        {open ? (
          <section
            id={panelId}
            className="pointer-events-auto absolute bottom-full mb-3 flex h-[min(28rem,70vh)] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-2xl shadow-base-content/15"
            aria-label="Help chat"
          >
            <header className="flex items-center justify-between gap-2 border-b border-base-300 bg-primary px-3 py-2.5 text-primary-content">
              <div className="min-w-0">
                <p className="text-sm font-semibold">Help</p>
                <p className="truncate text-[11px] opacity-80">
                  Suggested questions &amp; account answers
                </p>
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

              {showSuggestions ? (
                <div className="space-y-2 pt-1" aria-label="Suggested questions">
                  <p className="text-[11px] font-semibold uppercase tracking-wide opacity-55">
                    Try asking
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        className="rounded-xl border border-sky-200/80 bg-sky-50/90 px-3 py-2 text-left text-sm leading-snug text-sky-950 transition hover:border-sky-300 hover:bg-sky-100/90 disabled:opacity-60"
                        disabled={loading}
                        onClick={() => void sendMessage(suggestion)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {loading ? <p className="text-xs opacity-60">Thinking…</p> : null}
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
          className={`help-chat-fab pointer-events-auto flex size-14 items-center justify-center rounded-full text-2xl font-semibold shadow-lg transition-[transform,box-shadow] duration-200 ease-out hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
            mobileFixed ? "cursor-pointer" : dragging ? "cursor-grabbing" : "cursor-grab"
          } ${dragging ? "scale-105 shadow-xl" : ""}`}
          style={{
            touchAction: mobileFixed ? "manipulation" : "none",
            backgroundColor: "#123B5D",
            borderColor: "#0d2f4a",
            color: "#ffffff",
          }}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-label={open ? "Close help chat" : "Open help chat"}
          title={mobileFixed ? undefined : "Drag up or down to reposition"}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClick={onBubbleClick}
        >
          {open ? <X className="h-6 w-6" /> : <span aria-hidden>?</span>}
        </button>
      </div>
    </div>
  );
}
