import { useEffect, useState } from "react";
import { registerForPush, subscribePushStatus, type PushStatus } from "../fcm";

/**
 * Tells the person when this device cannot receive notifications, and — where
 * it's fixable — gives them the tap that fixes it.
 *
 * Home still asks for permission on mount, as it always did. This is the net
 * under that ask: registration is best-effort and fails quietly — a dismissed
 * prompt, a declined one, a browser that auto-blocked after earlier dismissals,
 * an iPhone still in Safari rather than installed to the Home Screen. Every one
 * of those looks, from the inside, like "the app never notified me". `worker`
 * sharpens the wording for someone whose job depends on hearing about tickets.
 */
export function PushStatusBanner({ worker = false }: { worker?: boolean }) {
  const [status, setStatus] = useState<PushStatus>("unknown");
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribePushStatus(setStatus), []);

  const stake = worker ?
    "you won't be alerted when a request comes in" :
    "you won't be alerted about updates to your requests";

  if (status === "granted" || status === "unknown") return null;

  const enable = async () => {
    setBusy(true);
    await registerForPush({ prompt: true });
    setBusy(false);
  };

  return (
    <div className="push-banner">
      <p className="push-banner-text">{message(status, stake)}</p>
      {(status === "default" || status === "error") && (
        <button
          className="btn-small"
          type="button"
          disabled={busy}
          onClick={enable}
        >
          {busy ? "…" : "Turn on notifications"}
        </button>
      )}
    </div>
  );
}

function message(status: PushStatus, stake: string): string {
  switch (status) {
    case "default":
      return `Notifications are off — ${stake}.`;
    case "denied":
      return `Notifications are blocked for this site — ${stake}. Re-allow them in your browser's site settings.`;
    case "unsupported":
      return `This browser can't show notifications — ${stake}. On iPhone, add the app to your Home Screen from Safari's Share menu (iOS 16.4+).`;
    case "unconfigured":
      return "Push isn't configured in this build.";
    default:
      return `Couldn't turn on notifications — ${stake}.`;
  }
}
