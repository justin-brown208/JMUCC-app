import { useState } from "react";
import { FirebaseError } from "firebase/app";
import { searchDocuments, type Citation } from "../search";
import type { SourceDoc } from "../searchConfig";

/**
 * Competition Rules — search + results (PAGES.md §4–5).
 *
 * Single-turn: type a question, get back ranked verbatim citations from the
 * rulebook + FAQ. No history, no follow-up. The full PDFs are one tap away via
 * the buttons at the bottom (→ §6).
 */
export function RulesSearch({
  onBack,
  onOpenPdf,
}: {
  onBack: () => void;
  onOpenPdf: (doc: SourceDoc) => void;
}) {
  const [query, setQuery] = useState("");
  // null = haven't searched yet; Citation[] = a completed search (maybe empty).
  const [results, setResults] = useState<Citation[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAsk = query.trim() !== "" && !busy;

  async function ask() {
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      setResults(await searchDocuments(query.trim()));
    } catch (e) {
      console.error("Rules search failed:", e);
      const notReady =
        e instanceof FirebaseError && e.code === "functions/failed-precondition";
      setError(
        notReady
          ? "The rulebook isn't loaded yet. Please check back later."
          : "Search is unavailable right now. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <button className="back" type="button" onClick={onBack}>
        ‹ Home
      </button>
      <h1 className="title">Competition Rules</h1>
      <p className="help">Ask something!</p>

      <div className="field">
        <textarea
          className="textarea"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="e.g. How many printed exhibits can we bring?"
        />
      </div>

      <button
        className="btn-primary"
        type="button"
        disabled={!canAsk}
        onClick={ask}
      >
        {busy ? "Searching…" : "Submit"}
      </button>

      {error && <p className="error">{error}</p>}

      {/* Results — only after a completed search. */}
      {results !== null && !error && (
        <div className="msg-list">
          {results.length === 0 ? (
            <p className="help">No relevant passages found.</p>
          ) : (
            results.map((c, i) => (
              <div className="msg" key={`${c.doc}-${i}`}>
                <p className="msg-title">{c.label}</p>
                <p className="msg-body">“{c.quote}”</p>
                <p className="msg-time">{c.docLabel}</p>
              </div>
            ))
          )}
        </div>
      )}

      <div className="divider" />

      <button
        className="btn"
        type="button"
        onClick={() => onOpenPdf("rulebook")}
      >
        Full Rulebook
      </button>
      <button className="btn" type="button" onClick={() => onOpenPdf("faq")}>
        Full FAQ
      </button>
    </div>
  );
}
