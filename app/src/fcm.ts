import {
  getMessaging,
  getToken,
  onMessage,
  isSupported,
} from "firebase/messaging";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { app, auth, db, VAPID_KEY } from "./firebase";

// A stable per-device id, kept in localStorage. The fcmTokens doc is keyed by
// this (not by the token) so a token refresh updates the same row instead of
// piling up duplicate device registrations.
const DEVICE_KEY = "jmucc.deviceId";

function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

// The fcmTokens write doubles as the device's "last seen" on /ops, and the
// dashboard pays one read per write — so an unchanged token for the same
// person is re-saved at most every 15 minutes. A new token or a different
// signed-in person always writes immediately (SCHEMA.md §4).
const SAVED_KEY = "jmucc.tokenSaved";
const RESAVE_MS = 15 * 60 * 1000;

function shouldSaveToken(personId: string, token: string): boolean {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    if (!raw) return true;
    const saved = JSON.parse(raw) as { personId?: string; token?: string; at?: number };
    return (
      saved.personId !== personId ||
      saved.token !== token ||
      typeof saved.at !== "number" ||
      Date.now() - saved.at > RESAVE_MS
    );
  } catch {
    return true;
  }
}

function markTokenSaved(personId: string, token: string) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify({ personId, token, at: Date.now() }));
  } catch {
    // Storage unavailable — we'll just write every time.
  }
}

/**
 * Where this device stands on push. Push used to fail silently in every one of
 * these states, which is why "the tech volunteer never got a notification" was
 * indistinguishable from a backend bug — `PushStatusBanner` renders this so the
 * person can see it and fix it.
 */
export type PushStatus =
  | "unknown" // not checked yet
  | "unsupported" // browser / iOS-not-installed-to-home-screen
  | "unconfigured" // VAPID key not wired
  | "default" // never asked — needs a tap to prompt
  | "denied" // the person said no; only browser settings can undo it
  | "granted" // registered, token saved
  | "error"; // supported and permitted, but registration failed

let status: PushStatus = "unknown";
const watchers = new Set<(s: PushStatus) => void>();

export const getPushStatus = (): PushStatus => status;

export function subscribePushStatus(cb: (s: PushStatus) => void): () => void {
  watchers.add(cb);
  cb(status);
  return () => watchers.delete(cb);
}

function setStatus(next: PushStatus) {
  status = next;
  watchers.forEach((cb) => cb(next));
}

/** A push that arrived while the app is open, for the in-app toast. */
export interface ForegroundPush {
  title: string;
  body: string;
  data: Record<string, string>;
}

export const FOREGROUND_PUSH_EVENT = "jmucc:push";

let foregroundBound = false;

/**
 * Register this device for push and save its token under the signed-in person.
 *
 * Asking for permission is a two-tier thing:
 *
 *  - Home asks on mount (`prompt`, `oncePerSession`). This is the original
 *    behaviour and it works — including in the installed iOS PWA, where by the
 *    time Home renders the person has already tapped through PIN entry, so the
 *    page has the user activation WebKit wants. Don't gate this on the browser.
 *  - If that ask doesn't end in "granted" — ignored, dismissed, or the person
 *    said no — the status lands on "default"/"denied" and PushStatusBanner
 *    shows, carrying a button that asks again from an unambiguous tap. That's
 *    the safety net, not the primary path.
 *
 * `oncePerSession` keeps the automatic ask to one per app load: Home remounts
 * every time the person returns to that tab, and re-firing the prompt on each
 * visit is what gets a site auto-blocked by browser heuristics. The banner
 * button ignores the flag — an explicit tap should always be able to retry.
 *
 * Still best-effort: the app works fully without notifications.
 */
let autoPromptUsed = false;

export async function registerForPush(
  {
    prompt = false,
    oncePerSession = false,
  }: { prompt?: boolean; oncePerSession?: boolean } = {}
): Promise<PushStatus> {
  try {
    if (!VAPID_KEY || VAPID_KEY.startsWith("PASTE_")) {
      setStatus("unconfigured");
      return status;
    }
    if (!(await isSupported())) {
      setStatus("unsupported");
      return status;
    }

    const personId = auth.currentUser?.uid;
    if (!personId) return status;

    let permission = Notification.permission;
    if (permission === "default" && prompt) {
      if (!oncePerSession || !autoPromptUsed) {
        if (oncePerSession) autoPromptUsed = true;
        permission = await Notification.requestPermission();
      }
    }
    if (permission !== "granted") {
      setStatus(permission === "denied" ? "denied" : "default");
      return status;
    }

    const messaging = getMessaging(app);
    // No serviceWorkerRegistration passed: the SDK auto-registers
    // /firebase-messaging-sw.js at its own scope, clear of the PWA worker.
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (!token) {
      setStatus("error");
      return status;
    }

    if (shouldSaveToken(personId, token)) {
      await setDoc(doc(db, "fcmTokens", deviceId()), {
        personId,
        token,
        updatedAt: serverTimestamp(),
      });
      markTokenSaved(personId, token);
    }

    // A foreground message is NOT displayed by the browser — the SDK hands it
    // to this callback instead. It used to only console.log, so every request
    // notification that landed while the app was open was thrown away. Re-emit
    // it as a DOM event; <Toasts> turns it into an in-app banner.
    if (!foregroundBound) {
      foregroundBound = true;
      onMessage(messaging, (payload) => {
        const detail: ForegroundPush = {
          title: payload.notification?.title ?? "JHMA",
          body: payload.notification?.body ?? "",
          data: (payload.data as Record<string, string>) ?? {},
        };
        window.dispatchEvent(
          new CustomEvent<ForegroundPush>(FOREGROUND_PUSH_EVENT, { detail })
        );
      });
    }

    setStatus("granted");
    return status;
  } catch (err) {
    console.warn("Push registration skipped:", err);
    setStatus("error");
    return status;
  }
}
