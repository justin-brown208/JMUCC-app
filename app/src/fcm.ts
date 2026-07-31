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

let foregroundBound = false;

/**
 * Register this device for push and save its token under the signed-in person.
 *
 * Best-effort and non-blocking: it no-ops safely wherever push isn't available
 * — unsupported browser, iOS PWA not yet installed (needs iOS 16.4+ via
 * Safari's Add to Home Screen), or the user declining the permission prompt.
 * Notifications are a bonus channel; the app works fully without them.
 */
export async function registerForPush(): Promise<void> {
  try {
    // Key not wired yet — skip so we don't trigger a permission prompt or a
    // getToken failure before the VAPID key is set.
    if (!VAPID_KEY || VAPID_KEY.startsWith("PASTE_")) return;
    if (!(await isSupported())) return;

    const personId = auth.currentUser?.uid;
    if (!personId) return;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const messaging = getMessaging(app);
    // No serviceWorkerRegistration passed: the SDK auto-registers
    // /firebase-messaging-sw.js at its own scope, clear of the PWA worker.
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (!token) return;

    await setDoc(doc(db, "fcmTokens", deviceId()), {
      personId,
      token,
      updatedAt: serverTimestamp(),
    });

    // Foreground messages don't auto-display; bind once. The message-display
    // feature will use this to live-update the in-app message list.
    if (!foregroundBound) {
      foregroundBound = true;
      onMessage(messaging, (payload) => {
        console.info("Foreground push:", payload?.notification?.title);
      });
    }
  } catch (err) {
    console.warn("Push registration skipped:", err);
  }
}
