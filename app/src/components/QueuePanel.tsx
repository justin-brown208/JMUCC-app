import { useEffect, useState } from "react";
import { auth } from "../firebase";
import {
  subscribeQueue,
  claimRequest,
  resolveRequest,
  dropRequest,
  dismissTicket,
  dismissedIds,
  isActive,
  isFreshlyClosed,
  type LiveHealth,
  type QueueId,
  type RequestTicket,
} from "../requests";

/**
 * The live worker view of a queue: active tickets oldest-first with full detail
 * (incl. phone) and the work actions. Rendered inline as the main content of the
 * Requests tab for a worker (PAGES.md §10).
 *
 * Two things this view has to get right when several workers share a queue:
 *   - A claimed ticket names its holder ("Claimed by Tara" / "Claimed by you"),
 *     so two people can't both think the other one's pill means themselves.
 *   - A ticket that closes while this worker was involved stays on screen as a
 *     terminal card ("Withdrawn by requester") instead of silently vanishing.
 *
 * The academic queue is special: it's worked by exactly one person (the VP
 * Academics), so there's no claiming — tickets are theirs by default and they
 * just resolve them. `noClaim` drops the Claim/Drop controls and the status pill.
 */
export function QueuePanel({ queue }: { queue: QueueId }) {
  const [tickets, setTickets] = useState<RequestTicket[] | undefined>(undefined);
  const [health, setHealth] = useState<LiveHealth>({ state: "ok" });
  // Seeded from the persisted set, so a dismissed card stays dismissed across
  // a reload and the tab badge agrees with what's on screen.
  const [dismissed, setDismissed] = useState<string[]>(dismissedIds);
  const [, setTick] = useState(0);
  const noClaim = queue === "academic";
  const me = auth.currentUser?.uid ?? "";

  useEffect(() => subscribeQueue(queue, setTickets, setHealth), [queue]);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const all = tickets ?? [];
  // A closed ticket is only this worker's business if they were the one on it.
  const mineRecently = (t: RequestTicket) =>
    isFreshlyClosed(t, dismissed) && (t.claimedBy === me || t.closedBy === me);
  const shown = all
    .filter((t) =>
      isActive(t) || (noClaim ? isFreshlyClosed(t, dismissed) : mineRecently(t))
    )
    .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));

  const dismiss = (id: string) => {
    dismissTicket(id);
    setDismissed((d) => [...d, id]);
  };

  return (
    <>
      {health.state !== "ok" && <p className="error">{health.reason}</p>}
      {tickets === undefined ? (
        // Never a bare "Loading…" on a stuck listener: if the first snapshot
        // can't arrive, the banner above says why and this stays honest.
        <p className="help">
          {health.state === "ok" ? "Loading…" : "Waiting for the queue…"}
        </p>
      ) : shown.length === 0 ? (
        <p className="help">Nothing waiting. 🎉</p>
      ) : (
        <div className="msg-list">
          {shown.map((t) => (
            <QueueTicket
              key={t.id}
              ticket={t}
              noClaim={noClaim}
              me={me}
              onDismiss={() => dismiss(t.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function QueueTicket({
  ticket,
  noClaim,
  me,
  onDismiss,
}: {
  ticket: RequestTicket;
  noClaim: boolean;
  me: string;
  onDismiss: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closed = !isActive(ticket);
  const mine = ticket.claimedBy === me;

  async function act(fn: () => Promise<void>, failure: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      console.error("Queue action failed:", e);
      // The most common cause is a race: someone else claimed or resolved it
      // first, and the rule's status precondition rejected this write.
      setError(failure);
    }
    setBusy(false); // the live subscription reflects the new state regardless
  }

  return (
    <article className={"msg" + (closed ? " msg--closed" : "")}>
      <div className="qticket-head">
        <h3 className="msg-title">{ticket.requesterName}</h3>
        {!noClaim && <StatusPill ticket={ticket} mine={mine} />}
      </div>
      <p className="msg-body">{ticket.description || "Call me"}</p>
      <p className="meta">
        {ticket.room ? `Room ${ticket.room}` : "No room"} · {ticket.phone}
        {ticket.createdAt ? ` · ${fmtTime(ticket.createdAt)}` : ""}
      </p>

      {error && <p className="error">{error}</p>}

      <div className="qticket-actions">
        {closed ? (
          <button className="btn-reset" type="button" onClick={onDismiss}>
            Dismiss
          </button>
        ) : noClaim ? (
          // Academic: no claim step — resolve straight from open.
          <button
            className="btn-primary"
            type="button"
            disabled={busy}
            onClick={() =>
              act(
                () => resolveRequest(ticket.id),
                "Couldn't resolve that — refresh and try again."
              )
            }
          >
            Resolve
          </button>
        ) : ticket.status === "open" ? (
          <button
            className="btn-primary"
            type="button"
            disabled={busy}
            onClick={() =>
              act(
                () => claimRequest(ticket.id),
                "Someone else got there first."
              )
            }
          >
            Claim
          </button>
        ) : (
          <>
            <button
              className="btn-primary"
              type="button"
              disabled={busy}
              onClick={() =>
                act(
                  () => resolveRequest(ticket.id),
                  "Couldn't resolve that — it may have just changed."
                )
              }
            >
              Resolve
            </button>
            <button
              className="btn-reset"
              type="button"
              disabled={busy}
              onClick={() =>
                act(
                  () => dropRequest(ticket.id),
                  "Couldn't release that — it may have just changed."
                )
              }
            >
              {mine ? "Drop" : "Free it up"}
            </button>
          </>
        )}
      </div>
    </article>
  );
}

// The pill carries the one fact a shared queue needs: who holds this, and is it
// me. "Claimed" alone read identically on every worker's phone.
function StatusPill({ ticket, mine }: { ticket: RequestTicket; mine: boolean }) {
  const { label, tone } = pillFor(ticket, mine);
  return <span className={"qticket-status qticket-status--" + tone}>{label}</span>;
}

function pillFor(
  t: RequestTicket,
  mine: boolean
): { label: string; tone: string } {
  switch (t.status) {
    case "resolved":
      return { label: "Resolved", tone: "done" };
    case "canceled":
      return { label: "Withdrawn", tone: "done" };
    case "claimed":
      return mine ?
        { label: "You've got this", tone: "claimed" } :
        { label: `Claimed by ${firstName(t.claimedByName) || "someone"}`,
          tone: "taken" };
    default:
      return { label: "Open", tone: "open" };
  }
}

const firstName = (name: string | null): string =>
  name?.trim() ? name.trim().split(/\s+/)[0] : "";

function fmtTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
