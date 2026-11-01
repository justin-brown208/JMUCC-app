/**
 * Notification send.
 *
 * An admin composes a message in the app (Admin > Compose, PAGES.md section 7):
 * a preset title, a body, an optional silent flag, one or more roles, and
 * optional narrowing filters (waves / team numbers). This callable does the
 * targeting the FCM token can't:
 *
 *   1. Loads people with the Admin SDK (the roster is client-locked).
 *   2. Filters people by role, then narrows by wave/team number, read from
 *      the person's own `wave` / `teamNumber` (NextGen has no schools).
 *   3. Writes the announcement doc with the computed recipientIds (that array
 *      drives both message history and open-tracking).
 *   4. Fans out FCM to those recipients' device tokens, pruning dead ones.
 *
 * Resolving the audience at send time (not from a cached field on the token)
 * is deliberate: correct someone's team in the console mid-event and the very
 * next send is already right, with no fan-out to re-run.
 */

import {onCall, HttpsError} from "firebase-functions/https";
import * as logger from "firebase-functions/logger";
import {
  getFirestore,
  FieldValue,
  type Firestore,
} from "firebase-admin/firestore";
import {getMessaging} from "firebase-admin/messaging";
import {
  ROLES,
  NOTIFICATION_TITLES,
  WAVES,
  TEAM_NUMBERS,
} from "./constants.js";
import {assertAdmin} from "./shared.js";
import {recordPush, tallyErrorCode} from "./ops.js";

export interface SendPayload {
  title: string;
  body: string;
  silent?: boolean;
  roles: string[];
  waves?: string[];
  teamNumbers?: number[];
}

export interface SendResult {
  announcementId: string;
  recipientCount: number; // people matched
  tokenCount: number; // devices targeted
  delivered: number; // FCM successes
  failed: number; // FCM failures
}

type TokenRef = {docId: string; personId: string; token: string};

/** FCM caps a multicast at 500 tokens. */
const MULTICAST_LIMIT = 500;

export const sendNotification = onCall(
  async (request): Promise<SendResult> => {
    const db = getFirestore();
    await assertAdmin(db, request.auth?.uid);
    const data = (request.data ?? {}) as SendPayload;
    validatePayload(data);
    return performSend(db, data);
  });

// Resolve targeting, record the announcement, and fan out FCM. Shared by the
// immediate send (above) and the scheduler (scheduling.ts) — both take the
// exact same path, so a scheduled send behaves identically to a live one.
export const performSend = async (
  db: Firestore,
  data: SendPayload
): Promise<SendResult> => {
  const roles = new Set<string>(data.roles);
  const waves = data.waves?.length ? new Set(data.waves) : null;
  const numbers = data.teamNumbers?.length ? new Set(data.teamNumbers) : null;

  // Filter the roster in memory.
  const peopleSnap = await db.collection("people").get();
  const recipientIds: string[] = [];
  for (const doc of peopleSnap.docs) {
    const p = doc.data();
    if (!roles.has(p.role)) continue;

    // Narrowing filters. Someone without the field can't match a filter on
    // it: a wave filter excludes PRCs (who have a team number but serve every
    // wave), and either filter excludes the teamless (Organizers, Floaters…).
    if (waves && !waves.has(p.wave)) continue;
    if (numbers && !numbers.has(p.teamNumber)) continue;

    recipientIds.push(doc.id);
  }

  if (recipientIds.length === 0) {
    throw new HttpsError(
      "failed-precondition",
      "No one matches those recipients — adjust the roles or filters."
    );
  }

  const body = data.body.trim();
  const silent = data.silent === true;

  // Record the send. recipientIds is the durable record of who it went to:
  // message history reads it, open-tracking compares against it.
  const announcementRef = await db.collection("announcements").add({
    title: data.title,
    body,
    silent,
    sentAt: FieldValue.serverTimestamp(),
    recipientIds,
  });

  // Deliver to the recipients' devices.
  const tokens = await tokensFor(db, recipientIds);
  let delivered = 0;
  let failed = 0;
  let pruned = 0;
  let errorCodes: Record<string, number> = {};
  if (tokens.length > 0) {
    const res = await sendPush(
      tokens,
      data.title,
      body,
      silent,
      announcementRef.id
    );
    delivered = res.delivered;
    failed = res.failed;
    errorCodes = res.errorCodes;
    pruned = res.staleDocIds.length;
    if (pruned > 0) await pruneTokens(db, res.staleDocIds);
  }

  const withDevice = new Set(tokens.map((t) => t.personId));
  await recordPush(db, {
    kind: "announcement",
    refId: announcementRef.id,
    recipients: recipientIds.length,
    recipientsWithoutDevice: recipientIds.filter((id) => !withDevice.has(id))
      .length,
    tokens: tokens.length,
    delivered,
    failed,
    pruned,
    errorCodes,
  });

  logger.info("Notification sent", {
    announcementId: announcementRef.id,
    recipientCount: recipientIds.length,
    tokenCount: tokens.length,
    delivered,
    failed,
  });

  return {
    announcementId: announcementRef.id,
    recipientCount: recipientIds.length,
    tokenCount: tokens.length,
    delivered,
    failed,
  };
};

// Reject malformed composer input before touching the database. Shared by the
// send and schedule callables.
export const validatePayload = (data: SendPayload): void => {
  const bad = (msg: string) => new HttpsError("invalid-argument", msg);

  if (!(NOTIFICATION_TITLES as readonly string[]).includes(data.title)) {
    throw bad("Choose a valid title.");
  }
  if (typeof data.body !== "string" || data.body.trim() === "") {
    throw bad("The message body can't be empty.");
  }
  if (data.body.length > 2000) throw bad("The message is too long.");

  if (!Array.isArray(data.roles) || data.roles.length === 0) {
    throw bad("Choose at least one recipient group.");
  }
  for (const r of data.roles) {
    if (!(ROLES as readonly string[]).includes(r)) {
      throw bad(`Unknown role: ${r}`);
    }
  }

  if (data.waves !== undefined) {
    const ok = Array.isArray(data.waves) &&
      data.waves.every((w) => (WAVES as readonly string[]).includes(w));
    if (!ok) throw bad("Waves must be A–C.");
  }
  if (data.teamNumbers !== undefined) {
    const ok = Array.isArray(data.teamNumbers) &&
      data.teamNumbers.every((n) =>
        (TEAM_NUMBERS as readonly number[]).includes(n));
    if (!ok) throw bad("Team numbers must be 1–4.");
  }
};

// Collect the FCM tokens for the given recipients. With ~500 devices it's
// cheaper to scan the small fcmTokens collection once than to run dozens of
// batched `in` queries (Firestore caps `in` at 30 values).
const tokensFor = async (
  db: Firestore,
  recipientIds: string[]
): Promise<TokenRef[]> => {
  const recipients = new Set(recipientIds);
  const snap = await db.collection("fcmTokens").get();
  const out: TokenRef[] = [];
  for (const doc of snap.docs) {
    const t = doc.data();
    if (recipients.has(t.personId) && typeof t.token === "string") {
      out.push({docId: doc.id, personId: t.personId, token: t.token});
    }
  }
  return out;
};

// Multicast the push in batches, tracking successes and dead tokens.
const sendPush = async (
  tokens: TokenRef[],
  title: string,
  body: string,
  silent: boolean,
  announcementId: string
): Promise<{
  delivered: number;
  failed: number;
  staleDocIds: string[];
  errorCodes: Record<string, number>;
}> => {
  const messaging = getMessaging();
  let delivered = 0;
  let failed = 0;
  const staleDocIds: string[] = [];
  const errorCodes: Record<string, number> = {};

  for (let i = 0; i < tokens.length; i += MULTICAST_LIMIT) {
    const batch = tokens.slice(i, i + MULTICAST_LIMIT);
    const response = await messaging.sendEachForMulticast({
      tokens: batch.map((t) => t.token),
      // Top-level notification carries the visible title/body; webpush adds
      // web options. `silent` suppresses sound/vibration (the quiet toggle) —
      // the notification still appears in the tray and the app.
      notification: {title, body},
      data: {announcementId},
      webpush: {
        notification: {title, body, silent},
      },
    });

    response.responses.forEach((r, idx) => {
      if (r.success) {
        delivered++;
        return;
      }
      failed++;
      tallyErrorCode(errorCodes, r.error?.code);
      // A token that's no longer registered will never work again — prune it.
      const code = r.error?.code;
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token" ||
        code === "messaging/invalid-argument"
      ) {
        staleDocIds.push(batch[idx].docId);
      }
    });
  }

  return {delivered, failed, staleDocIds, errorCodes};
};

// Delete token docs FCM reported as dead. Best-effort; never fails the send.
const pruneTokens = async (
  db: Firestore,
  docIds: string[]
): Promise<void> => {
  await Promise.all(
    docIds.map((id) =>
      db
        .collection("fcmTokens")
        .doc(id)
        .delete()
        .catch((e) =>
          logger.warn("Failed to prune stale token", {
            docId: id,
            error: String(e),
          })
        )
    )
  );
};
