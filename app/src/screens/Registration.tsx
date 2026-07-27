import { useState } from "react";
import { signInWithPin } from "../auth";

/**
 * Registration — the app's only entry point (PAGES.md §1). A 6-digit PIN fully
 * identifies the person; there is no name/role selection. Wrong PIN shows an
 * inline error with no lockout or cooldown (decision 2026-07-18).
 *
 * On success, signInWithPin flips the Firebase auth state; App swaps to Home via
 * onAuthStateChanged, so this screen needs no success callback.
 */
export function Registration() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const complete = /^\d{6}$/.test(pin);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!complete || busy) return;
    setBusy(true);
    setError(null);
    try {
      await signInWithPin(pin);
      // App re-renders to Home on the auth-state change; nothing to do here.
    } catch (err) {
      console.error("PIN sign-in failed:", err); // real code/message for debugging
      setError(messageFor(err));
      setPin("");
      setBusy(false);
    }
  }

  return (
    <form className="screen" onSubmit={submit}>
      <h1 className="title">Registration PIN</h1>

      <input
        className="pin-input"
        value={pin}
        onChange={(e) => {
          setPin(e.target.value.replace(/\D/g, "").slice(0, 6));
          setError(null);
        }}
        inputMode="numeric"
        autoComplete="off"
        autoFocus
        aria-label="6-digit PIN"
        placeholder="••••••"
        disabled={busy}
      />

      {error && <p className="error">{error}</p>}

      <button className="btn" type="submit" disabled={!complete || busy}>
        {busy ? "Checking…" : "Submit"}
      </button>

      <p className="help">
        Your 6-digit PIN was sent to you with your registration details. Ask an
        organizer if you can't find it.
      </p>
    </form>
  );
}

/** Map a sign-in error to friendly inline text. */
function messageFor(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  const message = (err as { message?: string })?.message;
  // The function returns friendly messages for these; surface them directly.
  if (code === "functions/unauthenticated" || code === "functions/invalid-argument") {
    return message || "That PIN wasn't recognized.";
  }
  // Everything else — Auth-config errors, token-redeem failures, or genuine
  // network drops. The console.error above carries the real code for debugging.
  return "Something went wrong signing in. Please try again.";
}
