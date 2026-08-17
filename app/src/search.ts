import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import type { SourceDoc } from "./searchConfig";

// One verified verbatim citation returned by the searchDocuments function.
export interface Citation {
  doc: SourceDoc;
  docLabel: string;
  label: string; // e.g. "Rulebook 5.1 — Materials"
  quote: string; // guaranteed to be a real span of the source PDF
  rank: number;
}

// Single-turn document search (PAGES.md §4–5). Returns ranked citations from
// the rulebook + FAQ, or [] if nothing in the docs answers the question. The
// server verifies every quote against the source, so results are never
// paraphrased or hallucinated.
export async function searchDocuments(query: string): Promise<Citation[]> {
  const call = httpsCallable<{ query: string }, { citations: Citation[] }>(
    functions,
    "searchDocuments"
  );
  const { data } = await call({ query });
  return data.citations ?? [];
}
