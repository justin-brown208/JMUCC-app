import { useEffect, useState } from "react";
import { AdminNav } from "../../components/AdminNav";
import {
  loadAnnouncements,
  getMessageTracking,
  type AnnouncementSummary,
  type TrackingResult,
  type GroupStat,
} from "../../tracking";
import type { View } from "../../App";

/**
 * Admin › Message Tracking (PAGES.md §8). Pick a sent notification, then see how
 * many recipients have opened the app since — broken down by role and by team,
 * each expandable to the named who-opened / who-hasn't list.
 */
export function Tracking({ onNavigate }: { onNavigate: (view: View) => void }) {
  const [list, setList] = useState<AnnouncementSummary[] | undefined>(undefined);
  const [detail, setDetail] = useState<TrackingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAnnouncements()
      .then(setList)
      .catch((e) => {
        console.error("Failed to load sent notifications:", e);
        setList([]);
      });
  }, []);

  async function open(id: string) {
    setLoading(true);
    setError(null);
    try {
      setDetail(await getMessageTracking(id));
    } catch (e) {
      console.error("Failed to load tracking:", e);
      setError("Couldn't load tracking for that message.");
    }
    setLoading(false);
  }

  if (detail) {
    return (
      <div className="screen">
        <AdminNav active="tracking" onNavigate={onNavigate} />
        <h1 className="title">Message Tracking</h1>
        <button
          className="btn-secondary"
          type="button"
          onClick={() => setDetail(null)}
        >
          ‹ All messages
        </button>
        <TrackingDetail result={detail} />
      </div>
    );
  }

  return (
    <div className="screen">
      <AdminNav active="tracking" onNavigate={onNavigate} />
      <h1 className="title">Message Tracking</h1>

      {error && <p className="error">{error}</p>}
      {loading && <p className="help">Loading…</p>}

      {list === undefined ? (
        <p className="help">Loading…</p>
      ) : list.length === 0 ? (
        <p className="help">No messages sent yet.</p>
      ) : (
        <div className="track-list">
          {list.map((a) => (
            <button
              key={a.id}
              type="button"
              className="track-item"
              onClick={() => open(a.id)}
            >
              <span className="track-item-title">{a.title}</span>
              <span className="meta">{a.sentAt ? fmt(a.sentAt) : ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TrackingDetail({ result }: { result: TrackingResult }) {
  const { opened, total } = result.overall;
  const pct = total ? Math.round((100 * opened) / total) : 0;
  return (
    <div className="track-detail">
      <article className="msg">
        <h3 className="msg-title">{result.title}</h3>
        <p className="msg-body">
          Opened by {opened} of {total} ({pct}%)
          {result.sentAt ? ` · sent ${fmt(new Date(result.sentAt))}` : ""}
        </p>
      </article>

      <h2 className="filters-header">By Role</h2>
      <div className="track-groups">
        {result.byRole.map((g) => (
          <GroupRow key={g.group} stat={g} />
        ))}
      </div>

      <h2 className="filters-header">By Team</h2>
      <div className="track-groups">
        {result.byTeam.map((g) => (
          <GroupRow key={g.group} stat={g} />
        ))}
      </div>
    </div>
  );
}

function GroupRow({ stat }: { stat: GroupStat }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="track-group">
      <button
        type="button"
        className="track-group-head"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="track-group-name">{stat.group}</span>
        <span className="track-count">
          {stat.opened}/{stat.total}
        </span>
      </button>
      {open && (
        <div className="track-names">
          {stat.openedNames.map((n) => (
            <p key={"o" + n} className="track-name track-name--opened">
              ✓ {n}
            </p>
          ))}
          {stat.pendingNames.map((n) => (
            <p key={"p" + n} className="track-name track-name--pending">
              ◦ {n}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function fmt(d: Date): string {
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
