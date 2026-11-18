/**
 * Scheduled notifications (Admin > Compose "Schedule later" + Scheduled tab).
 *
 * scheduleNotification writes a scheduledNotifications doc holding the compose
 * criteria + a sendAt time. runScheduledSends (every minute) fires the due ones
 * through the SAME performSend path as an immediate send, so targeting resolves
 * fresh at fire time. cancelScheduledNotification pulls one before it fires.
 *
 * The poller is free-tier cheap: it scales to zero between runs and each run is
 * one indexed query that's empty whenever nothing is due.
 */

import {onCall, HttpsError} from "firebase-functions/https";
import {onSchedule} from "firebase-functions/scheduler";
import * as logger from "firebase-functions/logger";
import {getFirestore, FieldValue, Timestamp} from "firebase-admin/firestore";
import {assertAdmin} from "./shared.js";
import {heartbeat, recordProblem} from "./ops.js";
import {
  validatePayload,
  performSend,
  type SendPayload,
} from "./notifications.js";

interface ScheduleRequest extends SendPayload {
  sendAtMillis?: number;
}

export const scheduleNotification = onCall(
  async (request): Promise<{id: string}> => {
    const db = getFirestore();
    await assertAdmin(db, request.auth?.uid);

    const data = (request.data ?? {}) as ScheduleRequest;
    validatePayload(data); // same validation as an immediate send

    const millis = data.sendAtMillis;
    if (typeof millis !== "number" || !Number.isFinite(millis)) {
      throw new HttpsError("invalid-argument", "Pick a send time.");
    }
    if (millis <= Date.now()) {
      throw new HttpsError(
        "invalid-argument",
        "The send time must be in the future."
      );
    }

    const ref = await db.collection("scheduledNotifications").add({
      title: data.title,
      body: data.body.trim(),
      silent: data.silent === true,
      roles: data.roles,
      divisions: data.divisions ?? [],
      teamLetters: data.teamLetters ?? [],
      school: data.school || null,
      sendAt: Timestamp.fromMillis(millis),
      status: "scheduled",
      createdBy: request.auth?.uid,
      createdAt: FieldValue.serverTimestamp(),
      announcementId: null,
      error: null,
    });
    return {id: ref.id};
  });

export const cancelScheduledNotification = onCall(
  async (request): Promise<{ok: boolean}> => {
    const db = getFirestore();
    await assertAdmin(db, request.auth?.uid);

    const id = request.data?.id;
    if (typeof id !== "string" || id === "") {
      throw new HttpsError("invalid-argument", "id is required.");
    }

    const ref = db.collection("scheduledNotifications").doc(id);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        throw new HttpsError("not-found", "That scheduled send is gone.");
      }
      if (snap.data()?.status !== "scheduled") {
        throw new HttpsError(
          "failed-precondition",
          "That send already fired or was canceled."
        );
      }
      tx.update(ref, {status: "canceled"});
    });
    return {ok: true};
  });

// Nudge a pending send earlier or later (the Scheduled tab's −15…+15 buttons).
// Takes a DELTA, not a new absolute time, and applies it to the stored sendAt
// inside a transaction — so two quick taps compose (+5, +5 = +10) instead of
// the second overwriting the first from a stale client copy.
const MAX_SHIFT_MINUTES = 24 * 60;

export const rescheduleNotification = onCall(
  async (request): Promise<{sendAtMillis: number}> => {
    const db = getFirestore();
    await assertAdmin(db, request.auth?.uid);

    const id = request.data?.id;
    const delta = request.data?.deltaMinutes;
    if (typeof id !== "string" || id === "") {
      throw new HttpsError("invalid-argument", "id is required.");
    }
    if (
      !Number.isInteger(delta) || delta === 0 ||
      Math.abs(delta) > MAX_SHIFT_MINUTES
    ) {
      throw new HttpsError(
        "invalid-argument",
        "deltaMinutes must be a non-zero whole number of minutes."
      );
    }

    const ref = db.collection("scheduledNotifications").doc(id);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        throw new HttpsError("not-found", "That scheduled send is gone.");
      }
      const data = snap.data() ?? {};
      if (data.status !== "scheduled") {
        throw new HttpsError(
          "failed-precondition",
          "That send already fired or was canceled."
        );
      }
      const current = (data.sendAt as Timestamp).toMillis();
      const next = current + delta * 60_000;
      if (next <= Date.now()) {
        throw new HttpsError(
          "failed-precondition",
          "That would put it in the past."
        );
      }
      tx.update(ref, {sendAt: Timestamp.fromMillis(next)});
      return {sendAtMillis: next};
    });
  });

// Fire the due scheduled sends. Runs every minute; a no-op whenever the due
// query is empty (the normal case).
export const runScheduledSends = onSchedule("every 1 minutes", async () => {
  const db = getFirestore();
  await heartbeat(db);
  const dueSnap = await db
    .collection("scheduledNotifications")
    .where("status", "==", "scheduled")
    .where("sendAt", "<=", Timestamp.now())
    .get();

  for (const doc of dueSnap.docs) {
    const ref = doc.ref;

    // Atomically claim the doc so overlapping runs can't double-send.
    const claimed = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      if (fresh.data()?.status !== "scheduled") return false;
      tx.update(ref, {status: "sending"});
      return true;
    });
    if (!claimed) continue;

    const data = doc.data();
    try {
      const result = await performSend(db, {
        title: data.title,
        body: data.body,
        silent: data.silent,
        roles: data.roles ?? [],
        divisions: data.divisions ?? [],
        teamLetters: data.teamLetters ?? [],
        school: data.school ?? null,
      });
      await ref.update({
        status: "sent",
        announcementId: result.announcementId,
      });
      logger.info("Scheduled send fired", {id: ref.id, ...result});
    } catch (e) {
      // e.g. failed-precondition when the criteria match no one at fire time.
      await ref.update({
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
      });
      logger.error("Scheduled send failed", {id: ref.id, error: String(e)});
      await recordProblem(db, "error", "runScheduledSends",
        "Scheduled send failed", {id: ref.id, err: String(e)});
    }
  }
});
