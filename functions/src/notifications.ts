/**
 * Notification send.
 *
 * An admin composes a message in the app (Admin > Compose, PAGES.md section 7):
 * a preset title, a body, an optional silent flag, one or more roles, and
 * optional narrowing filters (divisions / team letters / one school). This
 * callable does the targeting the FCM token can't:
 *
 *   1. Loads people + schools with the Admin SDK (the roster is client-locked).
 *   2. Resolves each person's team in memory via their school (the single
 *      source of truth for division/teamLetter, never denormalized).
 *   3. Filters people by role, then narrows by division/letter/school.
 *   4. Writes the announcement doc with the computed recipientIds (that array
 *      drives both message history and open-tracking).
 *   5. Fans out FCM to those recipients' device tokens, pruning dead ones.
 *
 * Resolving teams at send time (not from a cached field on the token) is
 * deliberate: if the OC corrects a school's division mid-event, the very next
 * send is already correct, with no fan-out to re-run.
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
  TEAM_LETTERS,
} from "./constants.js";

interface SendRequest {
  title: string;
  body: string;
  silent?: boolean;
  roles: string[];
  divisions?: number[];
  teamLetters?: string[];
  school?: string | null;
}

interface SendResult {
  announcementId: string;
  recipientCount: number; // people matched
  tokenCount: number; // devices targeted
  delivered: number; // FCM successes
  failed: number; // FCM failures
}

type Team = {division: number | null; teamLetter: string | null};
type TokenRef = {docId: string; token: string};

/** FCM caps a multicast at 500 tokens. */
const MULTICAST_LIMIT = 500;

export const sendNotification = onCall(
  async (request): Promise<SendResult> => {
    const db = getFirestore();
    await assertAdmin(db, request.auth?.uid);

    const data = (request.data ?? {}) as SendRequest;
    validate(data);

    const roles = new Set<string>(data.roles);
    const divisions = data.divisions?.length ?
      new Set(data.divisions) :
      null;
    const letters = data.teamLetters?.length ?
      new Set(data.teamLetters) :
      null;
    const school = data.school || null;

    // Team lookup: schoolId -> {division, teamLetter}.
    const teamOf = await loadTeamLookup(db);

    // Filter the roster in memory.
    const peopleSnap = await db.collection("people").get();
    const recipientIds: string[] = [];
    for (const doc of peopleSnap.docs) {
      const p = doc.data();
      if (!roles.has(p.role)) continue;

      const team = p.school ? teamOf.get(p.school) : undefined;
      const division = team?.division ?? null;
      const teamLetter = team?.teamLetter ?? null;

      // Narrowing filters. Someone with no team can't match a team-based
      // filter, so setting one excludes the teamless (Organizers, etc.).
      if (divisions && (division === null || !divisions.has(division))) {
        continue;
      }
      if (letters && (teamLetter === null || !letters.has(teamLetter))) {
        continue;
      }
      if (school && p.school !== school) continue;

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
      if (res.staleDocIds.length > 0) await pruneTokens(db, res.staleDocIds);
    }

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
  });

// Gate on the caller's isAdmin flag (not their role — see CLAUDE.md).
const assertAdmin = async (
  db: Firestore,
  uid: string | undefined
): Promise<void> => {
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const doc = await db.collection("people").doc(uid).get();
  if (!doc.exists || doc.data()?.isAdmin !== true) {
    throw new HttpsError(
      "permission-denied",
      "You don't have permission to send notifications."
    );
  }
};

// Reject malformed composer input before touching the database.
const validate = (data: SendRequest): void => {
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

  if (data.divisions !== undefined) {
    const ok = Array.isArray(data.divisions) &&
      data.divisions.every((d) => Number.isInteger(d) && d >= 1 && d <= 6);
    if (!ok) throw bad("Divisions must be whole numbers 1–6.");
  }
  if (data.teamLetters !== undefined) {
    const letters = TEAM_LETTERS as readonly string[];
    const ok = Array.isArray(data.teamLetters) &&
      data.teamLetters.every((l) => letters.includes(l));
    if (!ok) throw bad("Team letters must be A–D.");
  }
  if (
    data.school !== undefined &&
    data.school !== null &&
    typeof data.school !== "string"
  ) {
    throw bad("Bad school filter.");
  }
};

// Build the schoolId -> team lookup used to resolve people's divisions.
const loadTeamLookup = async (db: Firestore): Promise<Map<string, Team>> => {
  const snap = await db.collection("schools").get();
  const map = new Map<string, Team>();
  for (const doc of snap.docs) {
    const s = doc.data();
    map.set(doc.id, {
      division: s.division ?? null,
      teamLetter: s.teamLetter ?? null,
    });
  }
  return map;
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
      out.push({docId: doc.id, token: t.token});
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
): Promise<{delivered: number; failed: number; staleDocIds: string[]}> => {
  const messaging = getMessaging();
  let delivered = 0;
  let failed = 0;
  const staleDocIds: string[] = [];

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

  return {delivered, failed, staleDocIds};
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
