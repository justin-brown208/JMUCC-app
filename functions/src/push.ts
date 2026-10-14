// Send a simple push to a set of people (by person id). Looks up their device
// tokens in fcmTokens, multicasts, and prunes dead tokens. Used by the requests
// trigger; the notification send has its own richer path in notifications.ts.
//
// Delivery is best-effort — a person with notifications off (or a blocked
// browser) simply has no token. That is silent by design, so every call logs
// how many people resolved to how many tokens: a "0 tokens" line in the log is
// the evidence that a missing notification was a registration problem on the
// device, not a bug in the trigger.

import * as logger from "firebase-functions/logger";
import {getMessaging} from "firebase-admin/messaging";
import {type Firestore} from "firebase-admin/firestore";
import {recordPush, tallyErrorCode} from "./ops.js";

const MULTICAST_LIMIT = 500;
// Firestore caps an `in` filter at 30 values.
const IN_LIMIT = 30;

export interface PushPayload {
  title: string;
  body: string;
  /** Small string map the client uses to route the tap / foreground toast. */
  data?: Record<string, string>;
}

export const pushToPersonIds = async (
  db: Firestore,
  personIds: string[],
  payload: PushPayload
): Promise<void> => {
  const ids = [...new Set(personIds.filter(Boolean))];
  if (ids.length === 0) return;

  // Query only the recipients' registrations rather than scanning the whole
  // collection — `in` takes 30 ids at a time.
  const tokens: Array<{docId: string; personId: string; token: string}> = [];
  for (let i = 0; i < ids.length; i += IN_LIMIT) {
    const snap = await db
      .collection("fcmTokens")
      .where("personId", "in", ids.slice(i, i + IN_LIMIT))
      .get();
    for (const doc of snap.docs) {
      const t = doc.data();
      if (typeof t.token === "string" && t.token) {
        tokens.push({docId: doc.id, personId: t.personId, token: t.token});
      }
    }
  }

  const record = (r: {
    delivered: number;
    failed: number;
    pruned: number;
    errorCodes: Record<string, number>;
  }) => {
    const withDevice = new Set(tokens.map((t) => t.personId));
    return recordPush(db, {
      kind: payload.data?.kind ?? "request",
      refId: payload.data?.requestId ?? "",
      recipients: ids.length,
      recipientsWithoutDevice: ids.filter((id) => !withDevice.has(id)).length,
      tokens: tokens.length,
      ...r,
    });
  };

  if (tokens.length === 0) {
    logger.warn("Request push had no devices to send to", {
      recipients: ids.length,
      title: payload.title,
    });
    await record({delivered: 0, failed: 0, pruned: 0, errorCodes: {}});
    return;
  }

  const notification = {title: payload.title, body: payload.body};
  const messaging = getMessaging();
  const stale: string[] = [];
  let delivered = 0;
  let failed = 0;
  const errorCodes: Record<string, number> = {};
  for (let i = 0; i < tokens.length; i += MULTICAST_LIMIT) {
    const batch = tokens.slice(i, i + MULTICAST_LIMIT);
    const res = await messaging.sendEachForMulticast({
      tokens: batch.map((t) => t.token),
      notification,
      data: payload.data,
      webpush: {
        notification,
        // Let the browser surface each request event separately.
        fcmOptions: {link: "/"},
      },
    });
    delivered += res.successCount;
    res.responses.forEach((r, idx) => {
      if (r.success) return;
      failed++;
      const code = r.error?.code;
      tallyErrorCode(errorCodes, code);
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
    recipients: ids.length,
    tokens: tokens.length,
    delivered,
    pruned: stale.length,
    title: payload.title,
  });
  await record({delivered, failed, pruned: stale.length, errorCodes});
};
