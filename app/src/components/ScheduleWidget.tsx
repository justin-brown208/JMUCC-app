import { useEffect, useMemo, useState } from "react";
import type { Profile } from "../auth";
import { loadSchedule, cachedSchedule, type ScheduleEvent } from "../schedule";

/**
 * Home schedule widget (PAGES.md §2): the current/next event shown large, a few
 * later ones smaller beneath, and a View Full Week button. Paints instantly from
 * the cached schedule, then refreshes from Google Calendar in the background.
 *
 * Admins get a "See as" control: pick a role group + team letter and the widget
 * shows the schedule that person would see (same calendar resolution, a stand-
 * in profile). Previews skip the cache, so the admin's own schedule is intact.
 */

// One representative role per calendar group — calendarIdsFor maps every
// volunteer role to the shared Volunteers calendar, so one stands in for all.
const SEE_AS = [
  { value: "Delegate", label: "Delegate" },
  { value: "Coach", label: "Coach" },
  { value: "Organizer", label: "Organizer" },
  { value: "General Volunteer", label: "Volunteer" },
];
const TEAMS = ["A", "B", "C", "D"];
export function ScheduleWidget({
  profile,
  onViewFullWeek,
}: {
  profile: Profile;
  onViewFullWeek: () => void;
}) {
  // Instant paint from the last fetch of my own schedule (read once).
  const [cached] = useState<ScheduleEvent[]>(() => cachedSchedule() ?? []);
  const [asRole, setAsRole] = useState(""); // "" = myself
  const [asTeam, setAsTeam] = useState(""); // "" = no team
  const previewing = profile.isAdmin && asRole !== "";
  const viewed = useMemo<Profile>(
    () =>
      previewing ?
        { ...profile, role: asRole, teamLetter: asTeam || null } :
        profile,
    [profile, previewing, asRole, asTeam]
  );

  // Keyed by what's being shown, so a stale fetch for a previous choice can't
  // land on top of the current one.
  const viewKey = previewing ? `${asRole}|${asTeam}` : "me";
  const [result, setResult] = useState<{ key: string; events: ScheduleEvent[] } | null>(null);

  useEffect(() => {
    let live = true;
    loadSchedule(viewed, { cache: !previewing })
      .then((ev) => live && setResult({ key: viewKey, events: ev }))
      .catch((e) => {
        console.warn("Schedule load failed:", e);
        if (live) setResult({ key: viewKey, events: [] });
      });
    return () => {
      live = false;
    };
  }, [viewed, previewing, viewKey]);

  const loaded = result?.key === viewKey;
  const events: ScheduleEvent[] = loaded ?
    result.events :
    previewing ?
      [] :
      cached;

  const [featured, ...rest] = events;
  const upcoming = rest.slice(0, 4);

  return (
    <div className="cal">
      {profile.isAdmin && (
        <div className="cal-seeas">
          <span className="label">See as</span>
          <div className="cal-seeas-row">
            <div className="select-wrap">
              <select
                className="select"
                aria-label="See the schedule as role"
                value={asRole}
                onChange={(e) => setAsRole(e.target.value)}
              >
                <option value="">Me</option>
                {SEE_AS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <span className="select-caret">▾</span>
            </div>
            <div className="select-wrap">
              <select
                className="select"
                aria-label="See the schedule as team"
                value={asTeam}
                disabled={!previewing}
                onChange={(e) => setAsTeam(e.target.value)}
              >
                <option value="">No team</option>
                {TEAMS.map((t) => (
                  <option key={t} value={t}>
                    Team {t}
                  </option>
                ))}
              </select>
              <span className="select-caret">▾</span>
            </div>
          </div>
        </div>
      )}

      {featured ? (
        <>
          <div className="cal-featured">
            <p className="cal-when">{whenLabel(featured)}</p>
            <h2 className="cal-title">{featured.title}</h2>
            {featured.description && (
              <p className="cal-desc">{featured.description}</p>
            )}
            {featured.location && <p className="meta">{featured.location}</p>}
          </div>
          {upcoming.length > 0 && (
            <div className="cal-upcoming">
              {upcoming.map((e) => (
                <div key={e.id} className="cal-row">
                  <div className="cal-row-main">
                    <span className="cal-row-title">{e.title}</span>
                    {e.description && (
                      <span className="cal-row-desc">{e.description}</span>
                    )}
                  </div>
                  <span className="meta">{whenLabel(e)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="help">
          {loaded ? "No upcoming events." : "Loading schedule…"}
        </p>
      )}

      <button className="btn" type="button" onClick={onViewFullWeek}>
        View Full Week
      </button>
    </div>
  );
}

// "Today, 2:30 PM" / "Mon, 9:00 AM"; all-day events show just the day.
function whenLabel(e: ScheduleEvent): string {
  const now = new Date();
  const sameDay = e.start.toDateString() === now.toDateString();
  const day = sameDay ?
    "Today" :
    e.start.toLocaleDateString(undefined, { weekday: "short" });
  if (e.allDay) return day;
  const time = e.start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day}, ${time}`;
}
