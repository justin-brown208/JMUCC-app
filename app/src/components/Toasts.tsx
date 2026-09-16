import { useEffect, useState } from "react";
import { FOREGROUND_PUSH_EVENT, type ForegroundPush } from "../fcm";

/**
 * In-app banners for pushes that arrive while the app is open.
 *
 * The browser does not display a notification when the page has focus — FCM
 * hands it to the SDK's onMessage callback instead. Nothing rendered that, so
 * every "new request" / "resolved" push sent to someone actively using the app
 * was dropped on the floor. This is the missing half of the delivery path.
 *
 * Announcements are deliberately excluded: NotificationGate already shows those
 * as a modal off the Firestore feed, and a toast would double them up.
 */
const LIFETIME_MS = 8000;

interface Toast extends ForegroundPush {
  key: number;
}

export function Toasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const onPush = (e: Event) => {
      const detail = (e as CustomEvent<ForegroundPush>).detail;
      if (!detail) return;
      // Announcement pushes carry no `kind`; the modal gate owns those.
      if (!detail.data?.kind?.startsWith("request:")) return;
      const key = Date.now() + Math.random();
      setToasts((list) => [...list, { ...detail, key }]);
      setTimeout(
        () => setToasts((list) => list.filter((t) => t.key !== key)),
        LIFETIME_MS
      );
    };
    window.addEventListener(FOREGROUND_PUSH_EVENT, onPush);
    return () => window.removeEventListener(FOREGROUND_PUSH_EVENT, onPush);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.key}
          className="toast"
          type="button"
          onClick={() =>
            setToasts((list) => list.filter((x) => x.key !== t.key))
          }
        >
          <span className="toast-title">{t.title}</span>
          <span className="toast-body">{t.body}</span>
        </button>
      ))}
    </div>
  );
}
