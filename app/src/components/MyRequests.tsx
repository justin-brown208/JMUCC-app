import { useEffect, useState } from "react";
import {
  subscribeMyRequests,
  cancelRequest,
  dismissTicket,
  dismissedIds,
  isActive,
  isFreshlyClosed,
  QUEUE_META,
  type LiveHealth,
  type RequestTicket,
} from "../requests";

/**
 * The "My Requests" strip (PAGES.md §2): the person's own tickets with their
 * live position and a cancel control.
 *
 * It also holds a just-closed ticket on screen as a terminal card ("Resolved by
 * Tara") until it's dismissed or ages out. Filtering closed tickets out of the
 * query — the original behaviour — meant a resolve reached the requester only
 * as a push, so anyone with the app open or notifications off just watched
 * their row disappear with no explanation.
 */
export function MyRequests() {
  const [tickets, setTickets] = useState<RequestTicket[]>([]);
  const [health, setHealth] = useState<LiveHealth>({ state: "ok" });
  // Re-render on a slow tick so the closed-card age cap actually retires cards.
  const [, setTick] = useState(0);
  // Seeded from the persisted set — otherwise a card the person already
  // cleared comes back on the next reload, while the tab badge (which reads
  // the store directly) already counts it as gone.
  const [dismissed, setDismissed] = useState<string[]>(dismissedIds);

  useEffect(() => subscribeMyRequests(setTickets, setHealth), []);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const shown = tickets
    .filter((t) => isActive(t) || isFreshlyClosed(t, dismissed))
    .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));

  if (shown.length === 0 && health.state === "ok") return null;

  const dismiss = (id: string) => {
    dismissTicket(id);
    setDismissed((d) => [...d, id]);
  };

  return (
    <div className="field">
      <span className="label">My Requests</span>
      {health.state !== "ok" && <p className="error">{health.reason}</p>}
      <div className="myreq-list">
        {shown.map((t) => (
          <MyRequestRow key={t.id} ticket={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </div>
  );
}

function MyRequestRow({
  ticket,
  onDismiss,
}: {
  ticket: RequestTicket;
  onDismiss: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closed = !isActive(ticket);

  async function doCancel() {
    setBusy(true);
    setError(null);
    try {
      await cancelRequest(ticket.id);
      // No success state to set: the live subscription turns this row into the
      // "Cancelled" terminal card on its own.
    } catch (e) {
      console.error("Cancel request failed:", e);
      setError("Couldn't cancel that — tap to try again.");
      setConfirming(false);
      setBusy(false);
    }
  }

  return (
    <div className={"myreq" + (closed ? " myreq--closed" : "")}>
      <div className="myreq-main">
        <span className="myreq-queue">{QUEUE_META[ticket.queue].title}</span>
        <span className="myreq-position">{statusLine(ticket)}</span>
        {error && <span className="myreq-error">{error}</span>}
      </div>

      {closed ? (
        <button className="btn-reset" type="button" onClick={onDismiss}>
          Dismiss
        </button>
      ) : confirming ? (
        <div className="myreq-confirm">
          <button
            className="btn-reset"
            type="button"
            disabled={busy}
            onClick={doCancel}
          >
            {busy ? "…" : "Confirm"}
          </button>
          <button
            className="btn-reset"
            type="button"
            disabled={busy}
            onClick={() => setConfirming(false)}
          >
            Keep
          </button>
        </div>
      ) : (
        <button
          className="btn-reset"
          type="button"
          onClick={() => setConfirming(true)}
        >
          Cancel
        </button>
      )}
    </div>
  );
}

function statusLine(t: RequestTicket): string {
  const who = firstName(t.closedByName ?? t.claimedByName);
  switch (t.status) {
    case "resolved":
      return who ? `Resolved by ${who} ✓` : "Resolved ✓";
    case "canceled":
      return "Cancelled";
    case "claimed":
      return who ? `${who} is on it` : "Someone's on it";
    default:
      return t.position && t.position > 0 ?
        `You're #${t.position} in line` :
        "In queue";
  }
}

const firstName = (name: string | null): string =>
  name?.trim() ? name.trim().split(/\s+/)[0] : "";
