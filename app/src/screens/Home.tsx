import { useEffect, useState } from "react";
import { logout, type Profile } from "../auth";
import { registerForPush } from "../fcm";
import { recordAppOpen } from "../appOpens";
import { subscribeMessages, type Message } from "../messages";
import { MessageCard } from "../components/MessageCard";
import { ScheduleWidget } from "../components/ScheduleWidget";
import { MyRequests } from "../components/MyRequests";
import { submittableQueues, workedQueue, QUEUE_META, type QueueId } from "../requests";
import type { View } from "../App";

/**
 * Home — the hub (PAGES.md §2): greeting, schedule widget, latest announcement,
 * the requests zone (submit buttons + My Requests strip), and links out to
 * Previous Messages, My Queue (workers), and Admin.
 */
export function Home({
  profile,
  onNavigate,
  onSubmitRequest,
}: {
  profile: Profile;
  onNavigate: (view: View) => void;
  onSubmitRequest: (queue: QueueId) => void;
}) {
  const firstName = profile.fullName.split(" ")[0];

  // undefined = loading; null = none; Message = the latest.
  const [latest, setLatest] = useState<Message | null | undefined>(undefined);
  const [loadError, setLoadError] = useState(false);

  const canSubmit = submittableQueues(profile);
  const worksQueue = workedQueue(profile);

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

      {/* Requests zone — submit buttons (eligible submitters) + My Requests. */}
      {canSubmit.map((q) => (
        <button
          key={q}
          className="btn"
          type="button"
          onClick={() => onSubmitRequest(q)}
        >
          {QUEUE_META[q].submitLabel}
        </button>
      ))}
      <MyRequests />

      <button
        className="btn"
        type="button"
        onClick={() => onNavigate("rules")}
      >
        Competition Rules
      </button>

      <button
        className="btn"
        type="button"
        onClick={() => onNavigate("previous")}
      >
        Previous Messages
      </button>

      {worksQueue && (
        <button
          className="btn"
          type="button"
          onClick={() => onNavigate("queue")}
        >
          My Queue
        </button>
      )}

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
