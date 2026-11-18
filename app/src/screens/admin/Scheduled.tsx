import { useEffect, useState, type ReactNode } from "react";
import { AdminNav } from "../../components/AdminNav";
import {
  loadScheduled,
  cancelScheduled,
  rescheduleScheduled,
  reachTags,
  type ScheduledItem,
} from "../../scheduling";
import { loadSchools, type SchoolOption } from "../../notifications";
import { ROLES, TEAM_ROLES, TEAM_LETTERS } from "../../constants";
import type { View } from "../../App";

/**
 * Admin › Scheduled (PAGES.md §7a). A management list of sends, grouped by
 * status so the live ones lead: Upcoming (soonest first — the next to fire is
 * on top), Failed (only when there are any — someone needs to act on these),
 * Sent (newest first), then Canceled folded away. A pending send can be
 * nudged earlier/later with the shift buttons, or canceled. Scheduling itself
 * happens in Compose ("Schedule for later").
 *
 * "Viewing as" narrows the list to the UPCOMING sends one group would receive
 * — a role, plus an optional team letter for team roles. Sends that reach only
 * part of that group (one division, one school, or one letter when the letter
 * is "Any") stay listed with a tag saying who. Everything else is hidden.
 */

// Minutes per shift button, earliest-first so the row reads like a timeline.
const SHIFTS = [-15, -5, -1, 1, 5, 15];

const bySendAt = (dir: 1 | -1) => (a: ScheduledItem, b: ScheduledItem) =>
  dir * ((a.sendAt?.getTime() ?? 0) - (b.sendAt?.getTime() ?? 0));

export function Scheduled({ onNavigate }: { onNavigate: (view: View) => void }) {
  const [items, setItems] = useState<ScheduledItem[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [asRole, setAsRole] = useState(""); // "" = not filtering
  const [asLetter, setAsLetter] = useState(""); // "" = any team
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const teamRole = TEAM_ROLES.includes(asRole as never);

  // School → letter lookup, so a one-school send can be ruled in or out for a
  // letter. Failure just leaves those sends tagged "only <school>".
  useEffect(() => {
    loadSchools()
      .then(setSchools)
      .catch((e) => console.warn("Couldn't load schools:", e));
  }, []);

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

  async function shift(id: string, minutes: number) {
    setBusyId(id);
    setError(null);
    try {
      const sendAt = await rescheduleScheduled(id, minutes);
      // Patch locally — the server's answer is authoritative and re-sorting
      // happens on render, so no full reload is needed.
      setItems((prev) => prev?.map((it) => (it.id === id ? { ...it, sendAt } : it)));
    } catch (e) {
      console.error("Reschedule failed:", e);
      const msg = e instanceof Error ? e.message : "";
      setError(
        msg.includes("past")
          ? "That would put it in the past — try a smaller step."
          : "Couldn't move that — it may have already fired."
      );
      reload();
    }
    setBusyId(null);
  }

  const groups = items && {
    upcoming: items
      .filter((i) => i.status === "scheduled" || i.status === "sending")
      .sort(bySendAt(1)),
    failed: items.filter((i) => i.status === "failed").sort(bySendAt(-1)),
    sent: items.filter((i) => i.status === "sent").sort(bySendAt(-1)),
    canceled: items.filter((i) => i.status === "canceled").sort(bySendAt(-1)),
  };

  // Viewing-as: upcoming sends that reach the group, each with its tags.
  const viewing = asRole
    ? (groups?.upcoming ?? []).flatMap((it) => {
        const tags = reachTags(it, asRole, teamRole ? asLetter : "", schools);
        return tags ? [{ it, tags }] : [];
      })
    : null;
  const viewingLabel =
    asRole + (teamRole ? (asLetter ? ` · Team ${asLetter}` : " · any team") : "");

  const row = (it: ScheduledItem, tags?: string[]) => (
    <ScheduledRow
      key={it.id}
      item={it}
      tags={tags}
      busy={busyId === it.id}
      onCancel={() => cancel(it.id)}
      onShift={(m) => shift(it.id, m)}
    />
  );

  return (
    <div className="screen">
      <AdminNav active="scheduled" onNavigate={onNavigate} />
      <h1 className="title">Scheduled</h1>

      <div className="field">
        <span className="label">Viewing as</span>
        <div className="cal-seeas-row">
          <div className="select-wrap">
            <select
              className="select"
              aria-label="View scheduled sends as role"
              value={asRole}
              onChange={(e) => {
                setAsRole(e.target.value);
                setAsLetter("");
              }}
            >
              <option value="">Everyone (all sends)</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <span className="select-caret">▾</span>
          </div>
          {teamRole && (
            <div className="select-wrap">
              <select
                className="select"
                aria-label="View scheduled sends as team"
                value={asLetter}
                onChange={(e) => setAsLetter(e.target.value)}
              >
                <option value="">Any team</option>
                {TEAM_LETTERS.map((l) => (
                  <option key={l} value={l}>
                    Team {l}
                  </option>
                ))}
              </select>
              <span className="select-caret">▾</span>
            </div>
          )}
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {!groups ? (
        <p className="help">Loading…</p>
      ) : viewing ? (
        <div className="field">
          <span className="label">
            Upcoming for {viewingLabel} · {viewing.length} of {groups.upcoming.length}
          </span>
          {viewing.length === 0 ? (
            <p className="help">No upcoming sends reach this group.</p>
          ) : (
            <div className="msg-list">{viewing.map(({ it, tags }) => row(it, tags))}</div>
          )}
        </div>
      ) : items!.length === 0 ? (
        <p className="help">Nothing scheduled.</p>
      ) : (
        <>
          <Group label="Upcoming" count={groups.upcoming.length}>
            {groups.upcoming.length === 0 ? (
              <p className="help">Nothing pending.</p>
            ) : (
              groups.upcoming.map((it) => row(it))
            )}
          </Group>
          {groups.failed.length > 0 && (
            <Group label="Failed" count={groups.failed.length}>
              {groups.failed.map((it) => row(it))}
            </Group>
          )}
          {groups.sent.length > 0 && (
            <Group label="Sent" count={groups.sent.length}>
              {groups.sent.map((it) => row(it))}
            </Group>
          )}
          {groups.canceled.length > 0 && (
            <Group label="Canceled" count={groups.canceled.length} folded>
              {groups.canceled.map((it) => row(it))}
            </Group>
          )}
        </>
      )}
    </div>
  );
}

function Group({
  label,
  count,
  folded,
  children,
}: {
  label: string;
  count: number;
  folded?: boolean;
  children: ReactNode;
}) {
  const heading = (
    <span className="label">
      {label} · {count}
    </span>
  );
  if (folded) {
    return (
      <details className="field sched-group">
        <summary>{heading}</summary>
        <div className="msg-list">{children}</div>
      </details>
    );
  }
  return (
    <div className="field">
      {heading}
      <div className="msg-list">{children}</div>
    </div>
  );
}

function ScheduledRow({
  item,
  tags,
  busy,
  onCancel,
  onShift,
}: {
  item: ScheduledItem;
  /** Viewing-as only: what this group's reach depends on ([] = all of them). */
  tags?: string[];
  busy: boolean;
  onCancel: () => void;
  onShift: (minutes: number) => void;
}) {
  const filtered =
    item.divisions.length > 0 ||
    item.teamLetters.length > 0 ||
    item.school !== null;
  const pending = item.status === "scheduled";
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
      {tags && tags.length > 0 && (
        <p className="meta sched-reach">Reaches {tags.join(" · ")}</p>
      )}
      {item.status === "failed" && item.error && (
        <p className="meta">{item.error}</p>
      )}
      {pending && (
        <>
          <div className="sched-shift" role="group" aria-label="Move send time">
            {SHIFTS.map((m) => (
              <button
                key={m}
                className="btn-small"
                type="button"
                disabled={busy}
                aria-label={`${m < 0 ? "Earlier" : "Later"} by ${Math.abs(m)} minutes`}
                onClick={() => onShift(m)}
              >
                {m > 0 ? `+${m}` : `−${-m}`}
              </button>
            ))}
          </div>
          <button
            className="btn-reset"
            type="button"
            disabled={busy}
            onClick={onCancel}
          >
            {busy ? "Working…" : "Cancel"}
          </button>
        </>
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
