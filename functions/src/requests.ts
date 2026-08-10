/**
 * Requests trigger — keeps queue positions correct and fires the pushes.
 *
 * On any write to a requests/{id} doc:
 *   - Recomputes the live FIFO `position` for the queue's still-active tickets
 *     whenever the active set changes (a new ticket, or one leaving via
 *     resolve/cancel). position is pushed onto tickets because a requester
 *     can't read others' tickets to derive it (SCHEMA.md §6).
 *   - Sends the pushes: submit → the queue's worker(s); claim & resolve → the
 *     requester. Release and cancel are silent.
 *
 * Loop-safe: a write that doesn't change `status` (notably the trigger's own
 * position writes) returns immediately — no notify, no recompute.
 */

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

    const queue = (after?.queue ?? before?.queue) as string;

    await notifyForTransition(db, before, after);

    const wasActive = before ? ACTIVE.includes(before.status) : false;
    const isActive = after ? ACTIVE.includes(after.status) : false;
    if (wasActive !== isActive) {
      // A just-closed ticket keeps a stale position — clear it (SCHEMA §6).
      if (!isActive && afterSnap && after?.position != null) {
        await afterSnap.ref.update({position: null});
      }
      await recomputePositions(db, queue);
    }
  }
);

// Reassign 1..n by createdAt across the queue's active tickets; only writes a
// doc whose position actually changed (fewer writes, fewer re-triggers).
const recomputePositions = async (
  db: Firestore,
  queue: string
): Promise<void> => {
  const snap = await db
    .collection("requests")
    .where("queue", "==", queue)
    .where("status", "in", ACTIVE)
    .orderBy("createdAt", "asc")
    .get();

  const batch = db.batch();
  let pos = 1;
  let writes = 0;
  for (const doc of snap.docs) {
    if (doc.data().position !== pos) {
      batch.update(doc.ref, {position: pos});
      writes++;
    }
    pos++;
  }
  if (writes > 0) await batch.commit();
};

const notifyForTransition = async (
  db: Firestore,
  before: Data | null,
  after: Data | null
): Promise<void> => {
  // Submit — a brand-new open ticket → push the queue's worker(s).
  if (!before && after && after.status === "open") {
    const workers = await queueWorkerIds(db, after.queue);
    const room = after.room ? ` · Room ${after.room}` : "";
    await pushToPersonIds(db, workers, {
      title: queueLabel(after.queue),
      body: `New request from ${after.requesterName}${room}`,
    });
    return;
  }
  if (!before || !after) return;

  // Claim — push the requester that someone picked it up.
  if (before.status === "open" && after.status === "claimed") {
    await pushToPersonIds(db, [after.requesterId], {
      title: "Someone's on it",
      body: "A volunteer has picked up your request.",
    });
    return;
  }

  // Resolve — push the requester it's done.
  if (before.status === "claimed" && after.status === "resolved") {
    await pushToPersonIds(db, [after.requesterId], {
      title: "Request resolved",
      body: "Your request has been marked resolved.",
    });
  }
  // Release (claimed→open) and cancel (→canceled) are intentionally silent.
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
