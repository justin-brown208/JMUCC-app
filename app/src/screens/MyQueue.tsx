import { useEffect, useState } from "react";
import type { Profile } from "../auth";
import {
  workedQueue,
  subscribeQueue,
  claimRequest,
  resolveRequest,
  dropRequest,
  QUEUE_META,
  type RequestTicket,
} from "../requests";

/**
 * My Queue (PAGES.md §10) — a queue worker sees and works their queue: the
 * active tickets oldest-first with full detail (incl. phone), and claim /
 * resolve / drop actions. Which queue is fixed by the worker's role/flag.
 */
export function MyQueue({
  profile,
  onBack,
}: {
  profile: Profile;
  onBack: () => void;
}) {
  const queue = workedQueue(profile);
  const [tickets, setTickets] = useState<RequestTicket[] | undefined>(undefined);

  useEffect(() => {
    if (!queue) return;
    return subscribeQueue(queue, setTickets);
  }, [queue]);

  return (
    <div className="screen">
      <button className="back" type="button" onClick={onBack}>
        ‹ Home
      </button>
      <h1 className="title">{queue ? QUEUE_META[queue].workerTitle : "My Queue"}</h1>

      {!queue ? (
        <p className="help">You don't work a queue.</p>
      ) : tickets === undefined ? (
        <p className="help">Loading…</p>
      ) : tickets.length === 0 ? (
        <p className="help">Nothing waiting. 🎉</p>
      ) : (
        <div className="msg-list">
          {tickets.map((t) => (
            <QueueTicket key={t.id} ticket={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function QueueTicket({ ticket }: { ticket: RequestTicket }) {
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
        <span
          className={
            "qticket-status qticket-status--" +
            (ticket.status === "claimed" ? "claimed" : "open")
          }
        >
          {ticket.status === "claimed" ? "Claimed" : "Open"}
        </span>
      </div>
      <p className="msg-body">{ticket.description || "Call me"}</p>
      <p className="meta">
        {ticket.room ? `Room ${ticket.room}` : "No room"} · {ticket.phone}
        {ticket.createdAt ? ` · ${fmtTime(ticket.createdAt)}` : ""}
      </p>

      <div className="qticket-actions">
        {ticket.status === "open" ? (
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
