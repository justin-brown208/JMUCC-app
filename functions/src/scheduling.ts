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

// Fire the due scheduled sends. Runs every minute; a no-op whenever the due
// query is empty (the normal case).
export const runScheduledSends = onSchedule("every 1 minutes", async () => {
  const db = getFirestore();
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
    }
  }
});
