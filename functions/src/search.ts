/**
 * Document search (PAGES.md sections 4-5).
 *
 * Single-turn: the user asks a natural-language question, this callable returns
 * ranked *verbatim* citations from the two static source PDFs (rulebook + FAQ)
 * the OC uploads to Storage before the event. No conversation, no generated
 * prose — just quoted spans.
 *
 * Pipeline:
 *   1. Extract the PDFs' text (cached per warm instance — the PDFs are static).
 *   2. Send the text + question with a tunable prompt to the LLM (via
 *      OpenRouter, so the model is a swappable config string; primary then
 *      fallback on failure).
 *   3. The model returns candidate quotes as JSON. We DON'T trust it to quote
 *      perfectly: each quote is verified to be a genuine substring of the
 *      source (whitespace/case-insensitive) and dropped if not. That guard
 *      keeps the "verbatim only" guarantee while leaving the prompt free to
 *      tune — a misquote or hallucinated passage never reaches the user.
 *
 * The roster stays irrelevant here: any signed-in person may search.
 */

import {onCall, HttpsError} from "firebase-functions/https";
import * as logger from "firebase-functions/logger";
import {defineSecret} from "firebase-functions/params";
import {getStorage} from "firebase-admin/storage";
import OpenAI from "openai";
import {extractText, getDocumentProxy} from "unpdf";

const OPENROUTER_KEY = defineSecret("OPENROUTER_API_KEY");

// Model slugs are OpenRouter IDs — swap freely, no code change. Primary is
// tried first; the fallback runs only if the primary call throws.
const PRIMARY_MODEL = "anthropic/claude-sonnet-5";
const FALLBACK_MODEL = "openai/gpt-5";

// The two static source PDFs. OC uploads these to Storage (Firebase console)
// before the event; `id` is the client-facing key, `path` the Storage object.
const DOCS = [
  {id: "rulebook", label: "Rulebook", path: "documents/rulebook.pdf"},
  {id: "faq", label: "FAQ", path: "documents/faq.pdf"},
] as const;

type DocId = (typeof DOCS)[number]["id"];

interface Citation {
  doc: DocId;
  docLabel: string;
  label: string; // model-authored source label, e.g. "Rulebook 5.1"
  quote: string; // verified verbatim span
  rank: number;
}

// System prompt — this is the tuning point. It fixes the JSON contract and the
// verbatim rule; adjust wording/labels/count here as needed.
const SYSTEM_PROMPT = [
  "You are a citation search over two static competition documents: a",
  "Rulebook and an FAQ. Given the user's question, find the passages that",
  "answer it and return them as quotes copied EXACTLY from the source text —",
  "never paraphrase, summarize, correct spelling, or add words.",
  "Respond with ONLY a JSON object of this shape:",
  "{\"citations\":[{\"doc\":\"rulebook\"|\"faq\",",
  "\"label\":\"short source label, e.g. 'Rulebook 5.1 — Materials'\",",
  "\"quote\":\"exact verbatim span\",\"rank\":1}]}",
  "Order by relevance (rank 1 = best), at most 4 citations.",
  "If nothing in the documents answers the question, return",
  "{\"citations\":[]}. The label may be your own words; the quote MUST be",
  "copied character-for-character from the document.",
].join(" ");

// Warm-instance cache of extracted PDF text, keyed by Storage path. PDFs are
// static, so caching across invocations is safe; a cold start re-extracts.
const textCache = new Map<string, string>();

// Download a PDF from Storage and extract its plain text (cached). Returns null
// if the object doesn't exist — a doc may be uploaded later (e.g. the FAQ), and
// search should still work on whatever is present. Only successful loads are
// cached, so a not-yet-uploaded doc is re-checked (cheaply) on each call.
const loadDocText = async (path: string): Promise<string | null> => {
  const cached = textCache.get(path);
  if (cached !== undefined) return cached;

  const file = getStorage().bucket().file(path);
  const [exists] = await file.exists();
  if (!exists) return null;

  const [buf] = await file.download();
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const {text} = await extractText(pdf, {mergePages: true});
  const clean = Array.isArray(text) ? text.join("\n") : text;
  textCache.set(path, clean);
  return clean;
};

// Whitespace-normalize for display (collapse runs, trim).
const tidy = (s: string): string => s.replace(/\s+/g, " ").trim();

// Whitespace + case-insensitive form for the substring guard. Lenient on
// whitespace/casing (benign model reflow) but not on content — a swapped or
// dropped word won't match, so paraphrases/hallucinations fail the check.
const forMatch = (s: string): string => tidy(s).toLowerCase();

// Pull the JSON object out of a model response that may be fenced or padded.
const parseCitations = (raw: string): unknown[] => {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) return [];
  try {
    const obj = JSON.parse(raw.slice(start, end + 1));
    return Array.isArray(obj?.citations) ? obj.citations : [];
  } catch {
    return [];
  }
};

// One chat call through OpenRouter. Returns the raw message content.
const callModel = async (
  client: OpenAI,
  model: string,
  userContent: string
): Promise<string> => {
  const res = await client.chat.completions.create({
    model,
    temperature: 0,
    response_format: {type: "json_object"},
    messages: [
      {role: "system", content: SYSTEM_PROMPT},
      {role: "user", content: userContent},
    ],
  });
  return res.choices[0]?.message?.content ?? "";
};

export const searchDocuments = onCall(
  {secrets: [OPENROUTER_KEY]},
  async (request): Promise<{citations: Citation[]}> => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in first.");
    }
    const query = String((request.data as {query?: string})?.query ?? "")
      .trim();
    if (!query) {
      throw new HttpsError("invalid-argument", "Ask a question first.");
    }
    if (query.length > 500) {
      throw new HttpsError("invalid-argument", "Question is too long.");
    }

    // Load whichever source docs are present (cached after the first call).
    const texts: Record<string, string> = {};
    for (const doc of DOCS) {
      const t = await loadDocText(doc.path);
      if (t !== null) texts[doc.id] = t;
    }
    if (Object.keys(texts).length === 0) {
      throw new HttpsError(
        "failed-precondition",
        "Search documents aren't available yet."
      );
    }

    // Only include the docs that exist, so the model never sees an empty one.
    const userContent = [
      ...DOCS.filter((d) => texts[d.id]).map(
        (d) => `[${d.label.toUpperCase()}]\n${texts[d.id]}`
      ),
      `Question: ${query}`,
    ].join("\n\n");

    const client = new OpenAI({
      apiKey: OPENROUTER_KEY.value(),
      baseURL: "https://openrouter.ai/api/v1",
    });

    // Primary, then fallback. If both fail it's a real outage → surface it.
    let raw = "";
    try {
      raw = await callModel(client, PRIMARY_MODEL, userContent);
    } catch (primaryErr) {
      logger.warn("Primary model failed; trying fallback.", primaryErr);
      try {
        raw = await callModel(client, FALLBACK_MODEL, userContent);
      } catch (fallbackErr) {
        logger.error("Both models failed.", fallbackErr);
        throw new HttpsError("unavailable", "Search is temporarily down.");
      }
    }

    // Verify each candidate quote is a real span of its source; drop the rest.
    const out: Citation[] = [];
    for (const c of parseCitations(raw)) {
      const cand = c as Partial<Citation>;
      const doc = DOCS.find((d) => d.id === cand.doc);
      if (!doc) continue;
      const src = texts[doc.id];
      if (!src) continue; // model cited a doc that isn't loaded — drop it
      const quote = tidy(String(cand.quote ?? ""));
      if (!quote) continue;
      if (!forMatch(src).includes(forMatch(quote))) {
        logger.info("Dropped unverifiable quote.", {doc: doc.id, quote});
        continue;
      }
      out.push({
        doc: doc.id,
        docLabel: doc.label,
        label: tidy(String(cand.label ?? doc.label)) || doc.label,
        quote,
        rank: Number(cand.rank) || 999,
      });
    }
    out.sort((a, b) => a.rank - b.rank);
    return {citations: out.slice(0, 4)};
  });
