import { httpsCallable } from "firebase/functions";
import { auth, functions } from "./firebase";

/**
 * Forward uncaught client errors to the /ops dashboard (opsEvents, SCHEMA.md
 * §8) via the reportClientError callable.
 *
 * Only reports while signed in — the callable rejects anonymous callers so it
 * can't be used to flood the feed. Capped per page load and de-duplicated by
 * message, so an error thrown in a render loop costs a handful of writes, not
 * thousands. Reporting is best-effort and never throws.
 */

const MAX_PER_SESSION = 10;

// Browser noise that isn't an app bug.
const IGNORED = [/ResizeObserver loop/i, /^Script error\.?$/i];

const seen = new Set<string>();
let sent = 0;

function report(message: string, stack?: string) {
  if (!auth.currentUser) return;
  if (!message || IGNORED.some((re) => re.test(message))) return;
  if (seen.has(message) || sent >= MAX_PER_SESSION) return;
  seen.add(message);
  sent++;

  const call = httpsCallable(functions, "reportClientError");
  call({
    message,
    stack: stack ?? "",
    url: location.href,
    userAgent: navigator.userAgent,
  }).catch(() => undefined);
}

export function installErrorReporting() {
  window.addEventListener("error", (e) => {
    report(e.message || String(e.error), e.error?.stack);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    report(r instanceof Error ? r.message : String(r), r?.stack);
  });
}
