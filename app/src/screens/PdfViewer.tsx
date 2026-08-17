import { useEffect, useState } from "react";
import { getStorage, ref, getDownloadURL } from "firebase/storage";
import { app } from "../firebase";
import { DOC_PATHS, DOC_LABELS, type SourceDoc } from "../searchConfig";

/**
 * Full Document Viewer (PAGES.md §6). Renders a source PDF full-screen using the
 * browser's built-in PDF viewer (an <iframe> — the "off-the-shelf, not
 * custom-built" viewer the spec calls for). The URL is resolved at runtime from
 * Storage, so there's no hardcoded token and a doc that hasn't been uploaded yet
 * (e.g. the FAQ) shows a friendly message instead of a broken frame.
 */
export function PdfViewer({
  doc,
  onBack,
}: {
  doc: SourceDoc;
  onBack: () => void;
}) {
  // undefined = resolving; null = unavailable (not uploaded / error); string = URL.
  const [url, setUrl] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    setUrl(undefined);
    getDownloadURL(ref(getStorage(app), DOC_PATHS[doc]))
      .then((u) => alive && setUrl(u))
      .catch((e) => {
        console.error("PDF load failed:", e);
        if (alive) setUrl(null);
      });
    return () => {
      alive = false;
    };
  }, [doc]);

  return (
    <div className="screen">
      <button className="back" type="button" onClick={onBack}>
        ‹ Rules
      </button>
      <h1 className="title">{DOC_LABELS[doc]}</h1>

      {url === undefined ? (
        <p className="help">Loading…</p>
      ) : url === null ? (
        <p className="help">This document isn't available yet.</p>
      ) : (
        <>
          <iframe className="pdf-frame" src={url} title={DOC_LABELS[doc]} />
          <a
            className="btn-secondary"
            href={url}
            target="_blank"
            rel="noreferrer"
          >
            Open in a new tab
          </a>
        </>
      )}
    </div>
  );
}
