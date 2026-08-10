import { useEffect, useState } from "react";
import type { Profile } from "../auth";
import { loadSchedule, cachedSchedule, type ScheduleEvent } from "../schedule";

/**
 * Home schedule widget (PAGES.md §2): the current/next event shown large, a few
 * later ones smaller beneath, and a View Full Week button. Paints instantly from
 * the cached schedule, then refreshes from Google Calendar in the background.
 */
export function ScheduleWidget({
  profile,
  onViewFullWeek,
}: {
  profile: Profile;
  onViewFullWeek: () => void;
}) {
  const [events, setEvents] = useState<ScheduleEvent[]>(
    () => cachedSchedule() ?? []
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadSchedule(profile)
      .then(setEvents)
      .catch((e) => console.warn("Schedule load failed:", e))
      .finally(() => setLoaded(true));
  }, [profile]);

  const [featured, ...rest] = events;
  const upcoming = rest.slice(0, 4);

  return (
    <div className="cal">
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
