import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import {
  allocateNextDocumentNumber,
  bumpSequenceAfterManualNumber,
  type DocumentNumberKind,
} from "@/lib/document-numbering";

const KINDS: DocumentNumberKind[] = ["invoice", "contract", "ticket", "payment"];

function isKind(value: unknown): value is DocumentNumberKind {
  return typeof value === "string" && (KINDS as string[]).includes(value);
}

/** Allocate the next configured document number (advances the sequence). */
export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  let body: { kind?: string; consume?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!isKind(body.kind)) {
    return NextResponse.json({ error: "Unknown document number kind." }, { status: 400 });
  }

  if (typeof body.consume === "string" && body.consume.trim()) {
    const bumpError = await bumpSequenceAfterManualNumber(body.kind, body.consume.trim());
    if (bumpError) {
      return NextResponse.json({ error: bumpError }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const { number, error } = await allocateNextDocumentNumber(body.kind);
  if (error || !number) {
    return NextResponse.json({ error: error || "Could not allocate number." }, { status: 500 });
  }

  return NextResponse.json({ number });
}
