import { useEffect, useState } from "react";
import { subscribeMessages, type Message } from "../messages";

// Timestamp (ms) of the newest announcement the user has acknowledged. Persists
// on the device so "new since last time" survives reloads and app closes.
const SEEN_KEY = "jmucc.lastSeenNotif";

const readSeen = (): number => {
  const raw = localStorage.getItem(SEEN_KEY);
  if (raw) return Number(raw);
  // First ever run: seed to now so existing history doesn't blast the user —
  // only announcements sent from here on will pop.
  const now = Date.now();
  localStorage.setItem(SEEN_KEY, String(now));
  return now;
};

/**
 * Blocks the app with a modal whenever there are announcements the user hasn't
 * acknowledged — both on open (something sent since they were last here) and
 * live (something sent while they're in the app, via the onSnapshot feed).
 *
 * One notification at a time, oldest first: the modal's header IS the message's
 * title (Message / Announcement / Reminder). Dismiss acknowledges it and the
 * next unseen one (if any) takes its place.
 */
export function NotificationGate() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [lastSeen, setLastSeen] = useState<number>(readSeen);

  useEffect(() => subscribeMessages(20, setMessages, () => undefined), []);

  // Unseen, oldest first — acknowledge them in the order they were sent.
  const unseen = messages
    .filter((m) => m.sentAt !== null && m.sentAt.getTime() > lastSeen)
    .sort((a, b) => a.sentAt!.getTime() - b.sentAt!.getTime());
  if (unseen.length === 0) return null;

  const current = unseen[0];
  const dismiss = () => {
    const ts = current.sentAt!.getTime();
    localStorage.setItem(SEEN_KEY, String(ts));
    setLastSeen(ts);
  };

  return (
    // Click the blurred backdrop to dismiss; clicks inside the card don't bubble.
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={dismiss}
    >
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button
          className="modal-close"
          type="button"
          aria-label="Dismiss"
          onClick={dismiss}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={1.75} strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <h2 className="modal-title">{current.title}</h2>
        <div className="divider" />
        <p className="modal-body">{current.body}</p>
      </div>
    </div>
  );
}
