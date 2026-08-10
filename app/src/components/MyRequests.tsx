import { useEffect, useState } from "react";
import {
  subscribeMyRequests,
  cancelRequest,
  QUEUE_META,
  type RequestTicket,
} from "../requests";

/**
 * The "My Requests" strip on Home (PAGES.md §2): the person's own active
 * tickets with their live position and a cancel control. Renders nothing when
 * they have none. Position is pushed onto the ticket by the server trigger.
 */
export function MyRequests() {
  const [tickets, setTickets] = useState<RequestTicket[]>([]);

  useEffect(() => subscribeMyRequests(setTickets), []);

  if (tickets.length === 0) return null;

  return (
    <div className="field">
      <span className="label">My Requests</span>
      <div className="myreq-list">
        {tickets.map((t) => (
          <div key={t.id} className="myreq">
            <div className="myreq-main">
              <span className="myreq-queue">{QUEUE_META[t.queue].title}</span>
              <span className="myreq-position">{positionLabel(t)}</span>
            </div>
            <button
              className="btn-reset"
              type="button"
              onClick={() => cancelRequest(t.id).catch(() => undefined)}
            >
              Cancel
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function positionLabel(t: RequestTicket): string {
  if (t.status === "claimed") return "Someone's on it";
  if (t.position && t.position > 0) return `You're #${t.position} in line`;
  return "In queue";
}
