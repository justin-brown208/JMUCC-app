// Document-search client config.
//
// The two source PDFs live in Firebase Storage under documents/ (see SCHEMA.md
// → Storage). storage.rules makes documents/** publicly readable. The viewer
// (PAGES.md §6) resolves each PDF's download URL at runtime with the Storage
// SDK (getDownloadURL), so there's no hardcoded token to go stale and a
// not-yet-uploaded doc (e.g. the FAQ) is handled gracefully. Search itself
// reads the PDFs server-side and doesn't use these.

export type SourceDoc = "rulebook" | "faq";

export const DOC_PATHS: Record<SourceDoc, string> = {
  rulebook: "documents/rulebook.pdf",
  faq: "documents/faq.pdf",
};

export const DOC_LABELS: Record<SourceDoc, string> = {
  rulebook: "Rulebook",
  faq: "FAQ",
};
