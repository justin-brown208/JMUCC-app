// Send a simple push to a set of people (by person id). Looks up their device
// tokens in fcmTokens, multicasts, and prunes dead tokens. Used by the requests
// trigger; the notification send has its own richer path in notifications.ts.

import * as logger from "firebase-functions/logger";
import {getMessaging} from "firebase-admin/messaging";
import {type Firestore} from "firebase-admin/firestore";

const MULTICAST_LIMIT = 500;

export const pushToPersonIds = async (
  db: Firestore,
  personIds: string[],
  notification: {title: string; body: string}
): Promise<void> => {
  if (personIds.length === 0) return;

  const wanted = new Set(personIds);
  const snap = await db.collection("fcmTokens").get();
  const tokens: Array<{docId: string; token: string}> = [];
  for (const doc of snap.docs) {
    const t = doc.data();
    if (wanted.has(t.personId) && typeof t.token === "string") {
      tokens.push({docId: doc.id, token: t.token});
    }
  }
  if (tokens.length === 0) return;

  const messaging = getMessaging();
  const stale: string[] = [];
  for (let i = 0; i < tokens.length; i += MULTICAST_LIMIT) {
    const batch = tokens.slice(i, i + MULTICAST_LIMIT);
    const res = await messaging.sendEachForMulticast({
      tokens: batch.map((t) => t.token),
      notification,
      webpush: {notification},
    });
    res.responses.forEach((r, idx) => {
      if (r.success) return;
      const code = r.error?.code;
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token" ||
        code === "messaging/invalid-argument"
      ) {
        stale.push(batch[idx].docId);
      }
    });
  }

  await Promise.all(
    stale.map((id) =>
      db.collection("fcmTokens").doc(id).delete().catch(() => undefined)
    )
  );
  logger.info("Request push sent", {
    recipients: personIds.length,
    tokens: tokens.length,
  });
};
