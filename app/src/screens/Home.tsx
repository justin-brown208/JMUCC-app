import { useEffect, useState } from "react";
import { logout, type Profile } from "../auth";
import { registerForPush } from "../fcm";
import { recordAppOpen } from "../appOpens";
import { subscribeMessages, type Message } from "../messages";
import { MessageCard } from "../components/MessageCard";
import { ScheduleWidget } from "../components/ScheduleWidget";
import type { View } from "../App";

/**
 * Home — the hub (PAGES.md §2). Still growing: the schedule widget and requests
 * zone come later. For now it greets the person, shows the latest announcement,
 * and links to Previous Messages and (for admins) the Compose screen.
 */
export function Home({
  profile,
  onNavigate,
}: {
  profile: Profile;
  onNavigate: (view: View) => void;
}) {
  const firstName = profile.fullName.split(" ")[0];

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
      <p className="greeting">Hello {firstName}</p>
      <p className="help">
        Signed in as {profile.role}
        {profile.teamLetter ? ` · Team ${profile.teamLetter}` : ""}
      </p>

      <ScheduleWidget
        profile={profile}
        onViewFullWeek={() => onNavigate("fullweek")}
      />

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

      <button
        className="btn"
        type="button"
        onClick={() => onNavigate("previous")}
      >
        Previous Messages
      </button>

      {profile.isAdmin && (
        <button
          className="btn"
          type="button"
          onClick={() => onNavigate("compose")}
        >
          Admin
        </button>
      )}

      <button className="btn-secondary" type="button" onClick={() => logout()}>
        Log out
      </button>
    </div>
  );
}
