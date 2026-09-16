/**
 * Requests trigger — keeps queue positions correct and fires the pushes.
 *
 * On any write to a requests/{id} doc:
 *   - Recomputes the live FIFO `position` for the queue's still-active tickets
 *     whenever the active set changes (a new ticket, or one leaving via
 *     resolve/cancel). position is pushed onto tickets because a requester
 *     can't read others' tickets to derive it (SCHEMA.md §6).
 *   - Stamps the acting worker's roster name onto the ticket (`claimedByName`,
 *     `closedByName`). The client is NOT trusted for this: it only knows the
 *     name cached at login, so a console correction mid-event would otherwise
 *     start failing that person's claims. The server reads `people` and writes
 *     the name that's actually true right now.
 *   - Sends the pushes: submit → the queue's worker(s); claim & resolve → the
 *     requester; cancel of a *claimed* ticket → the worker holding it, so a job
 *     never silently vanishes out from under them. Release is silent, and so is
 *     cancelling a ticket nobody had picked up yet.
 *
 * Ordering and atomicity rules that earn their keep here:
 *   - Positions are recomputed BEFORE any push, and pushes are wrapped so a
 *     messaging failure can't abort the run. Previously a throwing push left
 *     every other requester in the queue with a stale number *and* triggered a
 *     retry of the whole function.
 *   - The recompute runs in a TRANSACTION. Two tickets closing in the same
 *     second give two invocations; read-then-write without a transaction lets
 *     the one that read first write last, restoring a slot for an already
 *     closed ticket and leaving everyone behind it permanently off by one —
 *     permanently, because position-only writes are loop-guarded, so no further
 *     trigger ever corrects it.
 *   - Loop-safe: a write that doesn't change `status` (notably the
 *     trigger's own position writes) returns immediately — no notify,
 *     no recompute.
 */

import * as logger from "firebase-functions/logger";
import {onDocumentWritten} from "firebase-functions/firestore";
import {getFirestore, type Firestore} from "firebase-admin/firestore";
import {pushToPersonIds} from "./push.js";

type Data = FirebaseFirestore.DocumentData;

const ACTIVE = ["open", "claimed"];

export const onRequestWrite = onDocumentWritten(
  "requests/{id}",
  async (event) => {
    const db = getFirestore();
    const afterSnap = event.data?.after;
    const before = event.data?.before?.exists ?
      event.data.before.data() as Data :
      null;
    const after = afterSnap?.exists ? afterSnap.data() as Data : null;
    if (!before && !after) return;

    // No status change on an update → nothing to notify and positions are
    // unaffected. Also absorbs the trigger's own position writes (loop guard).
    if (before && after && before.status === after.status) return;

    const id = event.params.id;
    const queue = (after?.queue ?? before?.queue) as string;
    logger.info("Request transition", {
      id,
      queue,
      from: before?.status ?? "(new)",
      to: after?.status ?? "(deleted)",
    });

    // Who acted, according to the roster rather than according to their phone.
    const actorName = await stampActorName(db, afterSnap, before, after);

    // Positions next: they're the thing a requester is staring at, and they
    // must not depend on FCM succeeding.
    const wasActive = before ? ACTIVE.includes(before.status) : false;
    const isActive = after ? ACTIVE.includes(after.status) : false;
    if (wasActive !== isActive) {
      // A just-closed ticket keeps a stale position — clear it in the same
      // transaction as the recompute (SCHEMA §6).
      const needsClear =
        !isActive && afterSnap?.exists && after?.position != null;
      const clearRef = needsClear ? afterSnap.ref : undefined;
      await recomputePositions(db, queue, clearRef);
    }

    // Best-effort: a push that fails must not roll back the work above or make
    // the platform retry this whole trigger.
    try {
      await notifyForTransition(db, id, before, after, actorName);
    } catch (err) {
      logger.error("Request push failed", {id, queue, err: String(err)});
    }
  }
);

// The roster name of a person, or "" if they've gone missing.
const personName = async (
  db: Firestore,
  personId: string
): Promise<string> => {
  const snap = await db.collection("people").doc(personId).get();
  const name = snap.data()?.fullName;
  return typeof name === "string" ? name : "";
};

// Write the acting worker's current roster name onto the ticket and return it.
//
// Denormalizing the name is what lets a requester and the other workers see WHO
// holds a ticket without reading `people` (which no client may read). Doing it
// here rather than accepting it from the client means it can't drift: the only
// name the client has is the one cached at login.
//
// This write doesn't change `status`, so the re-trigger it causes is absorbed
// by the loop guard at the top.
const stampActorName = async (
  db: Firestore,
  afterSnap: FirebaseFirestore.DocumentSnapshot | undefined,
  before: Data | null,
  after: Data | null
): Promise<string> => {
  if (!afterSnap?.exists || !after) return "";

  const [personId, field, current] =
    before?.status === "open" && after.status === "claimed" ?
      [after.claimedBy, "claimedByName", after.claimedByName] :
      after.status === "resolved" ?
        [after.closedBy, "closedByName", after.closedByName] :
        [null, "", null];

  if (typeof personId !== "string" || !personId) return "";
  const name = await personName(db, personId);
  if (!name) {
    logger.warn("Acting worker is not in the roster", {personId, field});
    return "";
  }
  if (current !== name) await afterSnap.ref.update({[field]: name});
  return name;
};

// Reassign 1..n by createdAt across the queue's active tickets, and optionally
// clear the position of the ticket that just closed, as one atomic unit.
//
// Transactional on purpose: the read set is locked, so two invocations racing
// on two near-simultaneous closes serialize instead of the slower one writing a
// position list computed from a set that has since changed. Only a doc whose
// position actually differs is written — fewer writes, fewer re-triggers.
const recomputePositions = async (
  db: Firestore,
  queue: string,
  clearRef?: FirebaseFirestore.DocumentReference
): Promise<void> => {
  const q = db
    .collection("requests")
    .where("queue", "==", queue)
    .where("status", "in", ACTIVE)
    .orderBy("createdAt", "asc");

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(q);
    let pos = 1;
    for (const doc of snap.docs) {
      if (doc.data().position !== pos) tx.update(doc.ref, {position: pos});
      pos++;
    }
    if (clearRef) tx.update(clearRef, {position: null});
  });
};

// First name only — these read as one-line notification bodies.
const firstName = (name: unknown): string =>
  typeof name === "string" && name.trim() ?
    name.trim().split(/\s+/)[0] :
    "";

const notifyForTransition = async (
  db: Firestore,
  id: string,
  before: Data | null,
  after: Data | null,
  actorName: string
): Promise<void> => {
  // Submit — a brand-new open ticket → push the queue's worker(s).
  if (!before && after && after.status === "open") {
    const workers = await queueWorkerIds(db, after.queue);
    if (workers.length === 0) {
      logger.warn("New request has no queue workers", {id, queue: after.queue});
      return;
    }
    const room = after.room ? ` · Room ${after.room}` : "";
    await pushToPersonIds(db, workers, {
      title: queueLabel(after.queue),
      body: `New request from ${after.requesterName}${room}`,
      data: {kind: "request:new", requestId: id, queue: after.queue},
    });
    return;
  }
  if (!before || !after) return;

  // Claim — push the requester that someone picked it up, by name.
  if (before.status === "open" && after.status === "claimed") {
    const who = firstName(actorName);
    await pushToPersonIds(db, [after.requesterId], {
      title: "Someone's on it",
      body: who ?
        `${who} has picked up your request.` :
        "A volunteer has picked up your request.",
      data: {kind: "request:claimed", requestId: id, queue: after.queue},
    });
    return;
  }

  // Resolve — push the requester it's done. Covers claimed→resolved (tech /
  // runner) and open→resolved (academic, which has no claim step).
  if (after.status === "resolved") {
    const who = firstName(actorName);
    await pushToPersonIds(db, [after.requesterId], {
      title: "Request resolved",
      body: who ?
        `${who} marked your request resolved.` :
        "Your request has been marked resolved.",
      data: {kind: "request:resolved", requestId: id, queue: after.queue},
    });
    return;
  }

  // Cancel — silent for the requester (they did it), but if a worker was
  // holding the ticket they need to know it's gone, or they'll keep chasing it.
  if (after.status === "canceled" && before.status === "claimed" &&
      before.claimedBy) {
    await pushToPersonIds(db, [before.claimedBy as string], {
      title: "Request withdrawn",
      body: `${after.requesterName} cancelled their request.`,
      data: {kind: "request:canceled", requestId: id, queue: after.queue},
    });
  }
  // Release (claimed→open) stays silent — nothing changes for the requester.
};

// The people who work a queue: tech → Tech Volunteers, runner → Runners,
// academic → whoever carries managesAcademicQueue.
const queueWorkerIds = async (
  db: Firestore,
  queue: string
): Promise<string[]> => {
  const people = db.collection("people");
  const q = queue === "tech" ?
    people.where("role", "==", "Tech Volunteer") :
    queue === "runner" ?
      people.where("role", "==", "Runner") :
      people.where("managesAcademicQueue", "==", true);
  const snap = await q.get();
  return snap.docs.map((d) => d.id);
};

const queueLabel = (queue: string): string =>
  queue === "academic" ?
    "Rules question" :
    queue === "tech" ?
      "Tech issue" :
      "Runner request";
