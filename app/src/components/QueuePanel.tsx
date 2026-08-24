import { useEffect, useState } from "react";
import {
  subscribeQueue,
  claimRequest,
  resolveRequest,
  dropRequest,
  type QueueId,
  type RequestTicket,
} from "../requests";

/**
 * The live worker view of a queue: active tickets oldest-first with full detail
 * (incl. phone) and the work actions. Rendered inline as the main content of the
 * Requests tab for a worker (PAGES.md §10).
 *
 * The academic queue is special: it's worked by exactly one person (the VP
 * Academics), so there's no claiming — tickets are theirs by default and they
 * just resolve them. `noClaim` drops the Claim/Drop controls and the status pill.
 */
export function QueuePanel({ queue }: { queue: QueueId }) {
  const [tickets, setTickets] = useState<RequestTicket[] | undefined>(undefined);
  const noClaim = queue === "academic";

  useEffect(() => subscribeQueue(queue, setTickets), [queue]);

  if (tickets === undefined) return <p className="help">Loading…</p>;
  if (tickets.length === 0) return <p className="help">Nothing waiting. 🎉</p>;

  return (
    <div className="msg-list">
      {tickets.map((t) => (
        <QueueTicket key={t.id} ticket={t} noClaim={noClaim} />
      ))}
    </div>
  );
}

function QueueTicket({
  ticket,
  noClaim,
}: {
  ticket: RequestTicket;
  noClaim: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function act(fn: (id: string) => Promise<void>) {
    setBusy(true);
    try {
      await fn(ticket.id);
    } catch (e) {
      console.error("Queue action failed:", e);
    }
    setBusy(false); // the live subscription reflects the new state regardless
  }

  return (
    <article className="msg">
      <div className="qticket-head">
        <h3 className="msg-title">{ticket.requesterName}</h3>
        {!noClaim && (
          <span
            className={
              "qticket-status qticket-status--" +
              (ticket.status === "claimed" ? "claimed" : "open")
            }
          >
            {ticket.status === "claimed" ? "Claimed" : "Open"}
          </span>
        )}
      </div>
      <p className="msg-body">{ticket.description || "Call me"}</p>
      <p className="meta">
        {ticket.room ? `Room ${ticket.room}` : "No room"} · {ticket.phone}
        {ticket.createdAt ? ` · ${fmtTime(ticket.createdAt)}` : ""}
      </p>

      <div className="qticket-actions">
        {noClaim ? (
          // Academic: no claim step — resolve straight from open.
          <button
            className="btn-primary"
            type="button"
            disabled={busy}
            onClick={() => act(resolveRequest)}
          >
            Resolve
          </button>
        ) : ticket.status === "open" ? (
          <button
            className="btn-primary"
            type="button"
            disabled={busy}
            onClick={() => act(claimRequest)}
          >
            Claim
          </button>
        ) : (
          <>
            <button
              className="btn-primary"
              type="button"
              disabled={busy}
              onClick={() => act(resolveRequest)}
            >
              Resolve
            </button>
            <button
              className="btn-reset"
              type="button"
              disabled={busy}
              onClick={() => act(dropRequest)}
            >
              Drop
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
