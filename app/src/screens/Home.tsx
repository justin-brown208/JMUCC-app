import { useEffect, useState } from "react";
import { logout, type Profile } from "../auth";
import { registerForPush } from "../fcm";
import { recordAppOpen } from "../appOpens";
import { subscribeMessages, type Message } from "../messages";
import { MessageCard } from "../components/MessageCard";
import { ScheduleWidget } from "../components/ScheduleWidget";

/**
 * Home tab — the dashboard (PAGES.md §2): a greeting (tap to reveal Log out),
 * the schedule widget, and the latest announcement. All navigation now lives in
 * the bottom bar, so Home is content-only.
 */
export function Home({
  profile,
  onOpenFullWeek,
}: {
  profile: Profile;
  onOpenFullWeek: () => void;
}) {
  const firstName = profile.fullName.split(" ")[0];
  const [menuOpen, setMenuOpen] = useState(false);

  // undefined = loading; null = none; Message = the latest.
  const [latest, setLatest] = useState<Message | null | undefined>(undefined);
  const [loadError, setLoadError] = useState(false);

  // On each Home open: register for push and stamp the open-tracking timestamp.
  useEffect(() => {
    registerForPush();
    recordAppOpen();
  }, []);

  useEffect(() => {
    return subscribeMessages(
      1,
      (msgs) => {
        setLatest(msgs[0] ?? null);
        setLoadError(false);
      },
      () => setLoadError(true)
    );
  }, []);

  return (
    <div className="screen">
      <button
        className="greeting-btn"
        type="button"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((o) => !o)}
      >
        <span className="greeting">Hello {firstName}</span>
        <span className="help">
          {profile.role}
          {profile.teamLetter ? ` · Team ${profile.teamLetter}` : ""}
        </span>
      </button>

      {menuOpen && (
        <button className="btn-secondary" type="button" onClick={() => logout()}>
          Log out
        </button>
      )}

      <ScheduleWidget profile={profile} onViewFullWeek={onOpenFullWeek} />

      <div className="field">
        <span className="label">Latest message</span>
        {latest === undefined ? (
          <p className="help">Loading…</p>
        ) : loadError ? (
          <p className="help">Couldn't load messages. Check your connection.</p>
        ) : latest === null ? (
          <p className="help">No messages yet.</p>
        ) : (
          <MessageCard message={latest} />
        )}
      </div>
    </div>
  );
}
