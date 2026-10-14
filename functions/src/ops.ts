/**
 * Ops monitoring (the admin /ops dashboard).
 *
 * Two halves:
 *   - Recorders, called from the other functions at the moments worth seeing:
 *     every search (model, tokens, OpenRouter's billed cost), every push
 *     fan-out (delivered / failed / error codes), every server problem, and a
 *     scheduler heartbeat. Each writes one `opsEvents` doc and bumps running
 *     totals on `ops/stats` in the same batch, so the dashboard reads week
 *     totals from one document instead of re-reading thousands of events.
 *   - Callables: `getOpsRoster` (the roster minus PINs, plus last-open times —
 *     `people` and `appOpens` stay client-locked) and `reportClientError`.
 *
 * Recorders are strictly best-effort: monitoring must never fail the thing it
 * is monitoring, so every one swallows its own errors.
 */

import {onCall, HttpsError} from "firebase-functions/https";
import * as logger from "firebase-functions/logger";
import {
  getFirestore,
  FieldValue,
  type Firestore,
} from "firebase-admin/firestore";
import {assertAdmin} from "./shared.js";

const clip = (s: unknown, max: number): string =>
  String(s ?? "").slice(0, max);

// Write one event + its stat increments atomically. Never throws.
const record = async (
  db: Firestore,
  event: Record<string, unknown>,
  stats: Record<string, number>
): Promise<void> => {
  try {
    const batch = db.batch();
    batch.set(db.collection("opsEvents").doc(), {
      ...event,
      at: FieldValue.serverTimestamp(),
    });
    const inc: Record<string, FieldValue> = {};
    for (const [k, v] of Object.entries(stats)) {
      if (v) inc[k] = FieldValue.increment(v);
    }
    batch.set(db.collection("ops").doc("stats"), inc, {merge: true});
    await batch.commit();
  } catch (err) {
    logger.warn("Failed to record ops event", {
      type: event.type,
      err: String(err),
    });
  }
};

export interface SearchRecord {
  personId: string;
  query: string;
  ok: boolean;
  model: string | null; // the model that answered; null if all failed
  fallback: boolean; // answered by a model other than the primary
  citations: number; // verified citations returned
  dropped: number; // candidate quotes that failed the verbatim check
  promptTokens: number;
  cachedTokens: number;
  completionTokens: number;
  cost: number | null; // OpenRouter usage.cost (credits); null if absent
  durationMs: number;
}

export const recordSearch = (db: Firestore, s: SearchRecord) =>
  record(
    db,
    {type: "search", ...s, query: clip(s.query, 500)},
    {
      searches: 1,
      searchesFailed: s.ok ? 0 : 1,
      searchesEmpty: s.ok && s.citations === 0 ? 1 : 0,
      searchesFallback: s.fallback ? 1 : 0,
      searchCost: s.cost ?? 0,
      searchPromptTokens: s.promptTokens,
      searchCachedTokens: s.cachedTokens,
      searchCompletionTokens: s.completionTokens,
    }
  );

export interface PushRecord {
  kind: string; // "announcement" | "request:new" | "request:claimed" | ...
  refId: string; // announcement or request id
  recipients: number; // people targeted
  recipientsWithoutDevice: number; // of those, people with no registration
  tokens: number; // devices targeted
  delivered: number; // accepted by FCM (not proof of display)
  failed: number;
  pruned: number; // dead registrations deleted
  errorCodes: Record<string, number>; // FCM error code -> count
}

export const recordPush = (db: Firestore, p: PushRecord) =>
  record(db, {type: "push", ...p}, {
    pushes: 1,
    pushTokens: p.tokens,
    pushDelivered: p.delivered,
    pushFailed: p.failed,
    pushRecipientsWithoutDevice: p.recipientsWithoutDevice,
  });

// Tally FCM failure codes. The "messaging/" prefix is dropped to keep map keys
// short and slash-free.
export const tallyErrorCode = (
  codes: Record<string, number>,
  code: string | undefined
): void => {
  const key = (code ?? "unknown").replace(/^messaging\//, "");
  codes[key] = (codes[key] ?? 0) + 1;
};

export const recordProblem = (
  db: Firestore,
  level: "error" | "warn",
  source: string,
  message: string,
  context: Record<string, unknown> = {}
) =>
  record(
    db,
    {
      type: "error",
      level,
      source,
      message: clip(message, 1000),
      context,
    },
    level === "error" ? {errors: 1} : {warnings: 1}
  );

// Scheduler liveness. Written every 5th minute rather than every run: the
// dashboard only needs to tell "running" from "stopped", and this keeps it to
// ~290 writes a day. No read needed to decide.
export const heartbeat = async (db: Firestore): Promise<void> => {
  if (new Date().getUTCMinutes() % 5 !== 0) return;
  try {
    await db.collection("ops").doc("heartbeat").set(
      {scheduledSendsAt: FieldValue.serverTimestamp()},
      {merge: true}
    );
  } catch (err) {
    logger.warn("Failed to write heartbeat", {err: String(err)});
  }
};

interface RosterPerson {
  id: string;
  fullName: string;
  role: string;
  school: string | null;
  isAdmin: boolean;
  managesAcademicQueue: boolean;
  lastOpenedAt: number | null; // ms epoch; null = never opened Home
}

interface RosterSchool {
  id: string;
  name: string;
  division: number | null;
  teamLetter: string | null;
}

// The roster for the dashboard's joins — never the PIN. Called once per page
// load (~1k reads), which is why it isn't polled.
export const getOpsRoster = onCall(
  async (request): Promise<{
    people: RosterPerson[];
    schools: RosterSchool[];
  }> => {
    const db = getFirestore();
    await assertAdmin(db, request.auth?.uid);

    const [peopleSnap, schoolsSnap, opensSnap] = await Promise.all([
      db.collection("people").get(),
      db.collection("schools").get(),
      db.collection("appOpens").get(),
    ]);

    const opened = new Map<string, number>();
    for (const doc of opensSnap.docs) {
      const ts = doc.data().lastOpenedAt;
      if (ts?.toMillis) opened.set(doc.id, ts.toMillis());
    }

    const people = peopleSnap.docs.map((doc) => {
      const p = doc.data();
      return {
        id: doc.id,
        fullName: String(p.fullName ?? ""),
        role: String(p.role ?? ""),
        school: p.school ?? null,
        isAdmin: p.isAdmin === true,
        managesAcademicQueue: p.managesAcademicQueue === true,
        lastOpenedAt: opened.get(doc.id) ?? null,
      };
    });
    const schools = schoolsSnap.docs.map((doc) => {
      const s = doc.data();
      return {
        id: doc.id,
        name: String(s.name ?? ""),
        division: s.division ?? null,
        teamLetter: s.teamLetter ?? null,
      };
    });
    return {people, schools};
  });

// Client-side errors (uncaught exceptions / rejections). Signed-in callers
// only, so the endpoint can't be used anonymously to flood the feed; the client
// also caps itself per session.
export const reportClientError = onCall(
  async (request): Promise<{ok: boolean}> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
    const d = (request.data ?? {}) as Record<string, unknown>;
    const message = clip(d.message, 500).trim();
    if (!message) throw new HttpsError("invalid-argument", "No message.");

    await recordProblem(getFirestore(), "error", "client", message, {
      personId: uid,
      stack: clip(d.stack, 4000),
      url: clip(d.url, 500),
      userAgent: clip(d.userAgent, 400),
    });
    return {ok: true};
  });
