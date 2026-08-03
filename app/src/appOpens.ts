import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "./firebase";

/**
 * Stamp this person's last Home-open time (open tracking — SCHEMA.md §5).
 *
 * The admin Message Tracking view compares this against each notification's
 * sentAt to show who has opened the app since it went out. Best-effort: a failed
 * write (offline, blocker) must never block Home from rendering.
 *
 * The write is exactly { lastOpenedAt: serverTimestamp() } at doc id = uid, to
 * satisfy the appOpens rule (hasOnly ['lastOpenedAt'] + isNow).
 */
export async function recordAppOpen(): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try {
    await setDoc(doc(db, "appOpens", uid), { lastOpenedAt: serverTimestamp() });
  } catch (e) {
    console.warn("Failed to record app open:", e);
  }
}
