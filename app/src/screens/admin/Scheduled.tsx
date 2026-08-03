import { useEffect, useState } from "react";
import { AdminNav } from "../../components/AdminNav";
import {
  loadScheduled,
  cancelScheduled,
  type ScheduledItem,
} from "../../scheduling";
import type { View } from "../../App";

/**
 * Admin › Scheduled (PAGES.md §7a). A management list of future sends — view
 * what's queued and cancel anything still pending. Scheduling itself happens in
 * Compose ("Schedule for later"); this tab only lists and cancels.
 */
export function Scheduled({ onNavigate }: { onNavigate: (view: View) => void }) {
  const [items, setItems] = useState<ScheduledItem[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function reload() {
    loadScheduled()
      .then(setItems)
      .catch((e) => {
        console.error("Failed to load scheduled sends:", e);
        setItems([]);
      });
  }

  useEffect(reload, []);

  async function cancel(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await cancelScheduled(id);
      reload();
    } catch (e) {
      console.error("Cancel failed:", e);
      setError("Couldn't cancel that — it may have already fired.");
    }
    setBusyId(null);
  }

  return (
    <div className="screen">
      <AdminNav active="scheduled" onNavigate={onNavigate} />
      <h1 className="title">Scheduled</h1>

      {error && <p className="error">{error}</p>}

      {items === undefined ? (
        <p className="help">Loading…</p>
      ) : items.length === 0 ? (
        <p className="help">Nothing scheduled.</p>
      ) : (
        <div className="msg-list">
          {items.map((it) => (
            <ScheduledRow
              key={it.id}
              item={it}
              busy={busyId === it.id}
              onCancel={() => cancel(it.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ScheduledRow({
  item,
  busy,
  onCancel,
}: {
  item: ScheduledItem;
  busy: boolean;
  onCancel: () => void;
}) {
  const filtered =
    item.divisions.length > 0 ||
    item.teamLetters.length > 0 ||
    item.school !== null;
  return (
    <article className="msg">
      <div className="sched-head">
        <h3 className="msg-title">{item.title}</h3>
        <span className={"sched-status sched-status--" + item.status}>
          {statusLabel(item.status)}
        </span>
      </div>
      <p className="msg-body">{item.body}</p>
      <p className="meta">
        {item.sendAt ? formatWhen(item.sendAt) : "—"} · {item.roles.join(", ")}
        {filtered ? " (filtered)" : ""}
        {item.silent ? " · silent" : ""}
      </p>
      {item.status === "failed" && item.error && (
        <p className="meta">{item.error}</p>
      )}
      {item.status === "scheduled" && (
        <button
          className="btn-reset"
          type="button"
          disabled={busy}
          onClick={onCancel}
        >
          {busy ? "Canceling…" : "Cancel"}
        </button>
      )}
    </article>
  );
}

function statusLabel(s: ScheduledItem["status"]): string {
  switch (s) {
    case "scheduled":
      return "Scheduled";
    case "sending":
      return "Sending";
    case "sent":
      return "Sent";
    case "canceled":
      return "Canceled";
    case "failed":
      return "Failed";
  }
}

function formatWhen(d: Date): string {
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
