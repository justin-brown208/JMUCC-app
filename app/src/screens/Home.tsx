import { useEffect, useState } from "react";
import { logout, type Profile } from "../auth";
import { registerForPush } from "../fcm";
import { recordAppOpen } from "../appOpens";
import { subscribeMessages, type Message } from "../messages";
import { MessageCard } from "../components/MessageCard";
import { ScheduleWidget } from "../components/ScheduleWidget";
import { PushStatusBanner } from "../components/PushStatusBanner";

/**
 * Home tab — the dashboard (PAGES.md §2): a greeting (tap to reveal Log out),
 * the schedule widget, and the latest announcement. All navigation now lives in
 * the bottom bar, so Home is content-only.
 */
export function Home({ profile }: { profile: Profile }) {
  const firstName = profile.fullName.split(" ")[0];
  const [menuOpen, setMenuOpen] = useState(false);

  // undefined = loading; null = none; Message = the latest.
  const [latest, setLatest] = useState<Message | null | undefined>(undefined);
  const [loadError, setLoadError] = useState(false);

  // On each Home open: register for push and stamp the open-tracking timestamp.
  // The permission prompt fires here, as it always has (it reaches the iOS PWA
  // fine — PIN entry has already given the page user activation), but only once
  // per app load, since Home remounts on every return to this tab. Anything
  // short of "granted" is then picked up by PushStatusBanner below.
  useEffect(() => {
    registerForPush({ prompt: true, oncePerSession: true });
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
          {teamLabel(profile)}
        </span>
      </button>

      {menuOpen && (
        <button className="btn-secondary" type="button" onClick={() => logout()}>
          Log out
        </button>
      )}

      <PushStatusBanner />

      <ScheduleWidget profile={profile} />

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

// " · Team #3B" for a Team Ambassador; " · Room #3" for a PRC, whose classroom
// hosts team #3 from every wave; nothing for the teamless.
function teamLabel(p: Profile): string {
  if (p.teamNumber == null) return "";
  return p.wave ? ` · Team #${p.teamNumber}${p.wave}` : ` · Room #${p.teamNumber}`;
}
