import {
  collection,
  addDoc,
  doc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  type Query,
  type Unsubscribe,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import type { Profile } from "./auth";
import { ROLES } from "./constants";

export type QueueId = "academic" | "tech" | "runner";
export type RequestStatus = "open" | "claimed" | "resolved" | "canceled";

export interface RequestTicket {
  id: string;
  queue: QueueId;
  requesterId: string;
  requesterName: string;
  phone: string;
  room: string | null;
  description: string | null;
  status: RequestStatus;
  position: number | null;
  createdAt: Date | null;
  claimedBy: string | null;
  claimedByName: string | null;
  closedBy: string | null;
  closedByName: string | null;
  closedAt: Date | null;
}

// Per-queue UI labels. The submit button on Home names the intent; which queue
// a tap targets is fixed by the button (never chosen on the form).
export const QUEUE_META: Record<
  QueueId,
  { submitLabel: string; title: string; workerTitle: string }
> = {
  academic: {
    submitLabel: "Ask a Rules Question",
    title: "Ask a Rules Question",
    workerTitle: "Rules Questions",
  },
  runner: {
    submitLabel: "Request a Runner",
    title: "Request a Runner",
    workerTitle: "Runner Queue",
  },
  tech: {
    submitLabel: "Report a Tech Issue",
    title: "Report a Tech Issue",
    workerTitle: "Tech Queue",
  },
};

// NextGen runs two queues; the academic one (and its type/labels) stays
// dormant from the JMUCC build.
const LIVE_QUEUES: QueueId[] = ["tech", "runner"];
const QUEUE_ROLE: Partial<Record<QueueId, string>> = {
  tech: "Tech Volunteer",
  runner: "Runner",
};

// Which queues this person may submit to (mirrors the security rule): the
// roster is all staff, so every known role may submit to both.
export function submittableQueues(profile: Profile): QueueId[] {
  return ROLES.includes(profile.role as never) ? LIVE_QUEUES : [];
}

// The queues this person works: their role's own, plus any listed in their
// worksQueues flag (mirrors isQueueWorker in the rules). Usually zero or one.
export function workedQueues(profile: Profile): QueueId[] {
  return LIVE_QUEUES.filter(
    (q) => profile.role === QUEUE_ROLE[q] || profile.worksQueues.includes(q)
  );
}

export const isActive = (t: RequestTicket): boolean =>
  t.status === "open" || t.status === "claimed";

// Phone is typed once and kept on the device.
const PHONE_KEY = "jmucc.phone";
export const savedPhone = (): string => localStorage.getItem(PHONE_KEY) ?? "";
export const savePhone = (phone: string): void =>
  localStorage.setItem(PHONE_KEY, phone);

// --- "I've seen that it closed" bookkeeping -------------------------------
//
// A ticket leaving the active set is the moment someone needs to be TOLD
// something ("resolved", "withdrawn"), but it's also the moment it would drop
// out of a status-filtered query and vanish without a word — which is exactly
// how a resolve went unnoticed in testing. So the queries below fetch recent
// tickets regardless of status, the UI keeps a closed one on screen as a
// terminal card, and this set records the ones the person has dismissed.

const DISMISSED_KEY = "jmucc.reqDismissed";
const DISMISSED_CAP = 60;
/** How long a closed ticket stays on screen if it's never dismissed. */
export const CLOSED_VISIBLE_MS = 30 * 60 * 1000;

function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/** The persisted dismissal set. Views seed their state from this, or a card
 *  the person already cleared comes back on the next reload. */
export const dismissedIds = (): string[] => readDismissed();

const dismissWatchers = new Set<() => void>();

export function dismissTicket(id: string): void {
  const next = [id, ...readDismissed().filter((x) => x !== id)];
  try {
    localStorage.setItem(
      DISMISSED_KEY,
      JSON.stringify(next.slice(0, DISMISSED_CAP))
    );
  } catch {
    /* storage full / blocked — the time cap still retires the card */
  }
  dismissWatchers.forEach((cb) => cb());
}

/** A closed ticket still worth showing: recent, and not dismissed yet. */
export function isFreshlyClosed(t: RequestTicket, dismissed: string[]): boolean {
  if (isActive(t)) return false;
  if (dismissed.includes(t.id)) return false;
  const at = (t.closedAt ?? t.createdAt)?.getTime();
  return at != null && Date.now() - at < CLOSED_VISIBLE_MS;
}

function toTicket(d: QueryDocumentSnapshot<DocumentData>): RequestTicket {
  const x = d.data();
  const date = (v: unknown): Date | null =>
    (v as Timestamp | undefined)?.toDate?.() ?? null;
  return {
    id: d.id,
    queue: x.queue as QueueId,
    requesterId: (x.requesterId as string) ?? "",
    requesterName: (x.requesterName as string) ?? "",
    phone: (x.phone as string) ?? "",
    room: (x.room as string | null) ?? null,
    description: (x.description as string | null) ?? null,
    status: (x.status as RequestStatus) ?? "open",
    position: (x.position as number | null) ?? null,
    createdAt: date(x.createdAt),
    claimedBy: (x.claimedBy as string | null) ?? null,
    claimedByName: (x.claimedByName as string | null) ?? null,
    closedBy: (x.closedBy as string | null) ?? null,
    closedByName: (x.closedByName as string | null) ?? null,
    closedAt: date(x.closedAt),
  };
}

// --- Requester actions ---
//
// Every one of these rejects loudly. The callers used to swallow the error,
// which made a rejected write look identical to a ticket that "wouldn't go
// away" — the UI rolled the optimistic change back and said nothing.

export async function submitRequest(input: {
  queue: QueueId;
  requesterName: string;
  phone: string;
  room: string;
  description: string;
}): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not signed in.");
  savePhone(input.phone.trim());
  await addDoc(collection(db, "requests"), {
    queue: input.queue,
    requesterId: uid,
    requesterName: input.requesterName,
    phone: input.phone.trim(),
    room: input.room.trim() || null,
    description: input.description.trim() || null,
    status: "open",
    createdAt: serverTimestamp(),
  });
}

// Cancelling also clears the claim fields, so a withdrawn ticket can't sit
// there still looking like someone's live job.
export async function cancelRequest(id: string): Promise<void> {
  await updateDoc(doc(db, "requests", id), {
    status: "canceled",
    closedAt: serverTimestamp(),
    claimedBy: null,
    claimedAt: null,
    claimedByName: null,
  });
}

// --- Worker actions ---

// claimedByName / closedByName are deliberately NOT sent: the trigger stamps
// them from the roster. The only name this client has is the one cached at
// login, so sending it would make a mid-event name correction start rejecting
// this person's claims.
export async function claimRequest(id: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not signed in.");
  await updateDoc(doc(db, "requests", id), {
    status: "claimed",
    claimedBy: uid,
    claimedAt: serverTimestamp(),
  });
}

export async function resolveRequest(id: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not signed in.");
  await updateDoc(doc(db, "requests", id), {
    status: "resolved",
    closedAt: serverTimestamp(),
    closedBy: uid,
  });
}

export async function dropRequest(id: string): Promise<void> {
  await updateDoc(doc(db, "requests", id), {
    status: "open",
    claimedBy: null,
    claimedAt: null,
    claimedByName: null,
  });
}

// --- Live subscriptions (persistent cache → instant paint) ---
//
// Each view runs TWO listeners, not one:
//
//   active — status-filtered, unbounded, oldest-first. This is the work. It is
//            deliberately uncapped: a single query of "recent tickets, newest
//            50" looks tidier but lets closed tickets crowd live ones out of
//            the window, so an old still-open ticket would silently disappear
//            from the worker's queue once the week's volume passed the limit.
//   closed — status-filtered the other way, newest-first, hard-capped. Purely
//            the raw material for terminal cards ("Resolved by Tara"), which is
//            why it can afford a limit.
//
// A listener that dies is the quietest failure in the app: the last snapshot
// stays painted forever, so a cancelled ticket appears to "stick". `live` keeps
// the subscription alive across errors with a backoff, and reports its health —
// including WHY — so the screen can say something instead of lying.

const ACTIVE_STATUSES = ["open", "claimed"];
const CLOSED_STATUSES = ["resolved", "canceled"];
/** Terminal cards only ever show a handful; the rest is history. */
const CLOSED_LIMIT = 12;

export interface LiveHealth {
  state: "ok" | "retrying";
  /** Plain-language cause, shown to the person while it retries. */
  reason?: string;
}

const OK: LiveHealth = { state: "ok" };
const RETRY_MS = [2000, 5000, 15000, 30000];

// Firestore error codes that won't clear on their own in a second or two. We
// still retry — a building index finishes, a refreshed token comes back — but
// slowly, and the person gets told what's actually wrong.
function healthFor(e: unknown): LiveHealth {
  const code = (e as { code?: string })?.code ?? "";
  if (code === "failed-precondition") {
    return {
      state: "retrying",
      reason:
        "A database index is still building — this can take a few minutes " +
        "after a deploy. It'll appear on its own.",
    };
  }
  if (code === "permission-denied" || code === "unauthenticated") {
    return {
      state: "retrying",
      reason:
        "This device isn't allowed to read this right now. If it persists, " +
        "log out and back in.",
    };
  }
  return { state: "retrying", reason: "Lost the live connection — reconnecting." };
}

const isSlowToClear = (e: unknown): boolean => {
  const code = (e as { code?: string })?.code ?? "";
  return (
    code === "failed-precondition" ||
    code === "permission-denied" ||
    code === "unauthenticated"
  );
};

function live(
  makeQuery: () => Query<DocumentData> | null,
  onData: (tickets: RequestTicket[]) => void,
  onHealth: (health: LiveHealth) => void
): Unsubscribe {
  let stopped = false;
  let attempt = 0;
  let inner: Unsubscribe | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const start = () => {
    if (stopped) return;
    const q = makeQuery();
    if (!q) {
      // Signed out, or auth hasn't restored yet. Don't park here forever —
      // check back, or the view stays permanently empty with no error.
      onData([]);
      timer = setTimeout(start, 1000);
      return;
    }
    inner = onSnapshot(
      q,
      (snap) => {
        attempt = 0;
        onHealth(OK);
        onData(snap.docs.map(toTicket));
      },
      (e) => {
        console.error("Requests listener error:", e);
        onHealth(healthFor(e));
        inner = null;
        // Something structural (index, permissions) won't fix itself in 2s;
        // back off to the slow end rather than hammering.
        const delay = isSlowToClear(e) ?
          RETRY_MS[RETRY_MS.length - 1] :
          RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)];
        attempt++;
        timer = setTimeout(start, delay);
      }
    );
  };

  start();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    inner?.();
  };
}

/**
 * Run the active + recently-closed pair as one logical subscription.
 *
 * Data is emitted only once the ACTIVE side has delivered — that's the half the
 * view can't be wrong about — and a ticket present in both (mid-transition)
 * resolves to its closed form, which is the newer truth.
 */
function subscribePair(
  makeActive: () => Query<DocumentData> | null,
  makeClosed: () => Query<DocumentData> | null,
  onData: (tickets: RequestTicket[]) => void,
  onHealth?: (health: LiveHealth) => void
): Unsubscribe {
  let active: RequestTicket[] = [];
  let closed: RequestTicket[] = [];
  let activeLoaded = false;
  let activeHealth: LiveHealth = OK;
  let closedHealth: LiveHealth = OK;

  const emitData = () => {
    if (!activeLoaded) return;
    const byId = new Map<string, RequestTicket>();
    for (const t of active) byId.set(t.id, t);
    for (const t of closed) byId.set(t.id, t);
    onData([...byId.values()]);
  };
  const emitHealth = () => {
    const bad =
      activeHealth.state !== "ok" ? activeHealth :
        closedHealth.state !== "ok" ? closedHealth :
          OK;
    onHealth?.(bad);
  };

  const stopActive = live(
    makeActive,
    (t) => {
      active = t;
      activeLoaded = true;
      emitData();
    },
    (h) => {
      activeHealth = h;
      emitHealth();
    }
  );
  const stopClosed = live(
    makeClosed,
    (t) => {
      closed = t;
      emitData();
    },
    (h) => {
      closedHealth = h;
      emitHealth();
    }
  );

  return () => {
    stopActive();
    stopClosed();
  };
}

/**
 * The requester's own tickets — every active one (with its live position) plus
 * the most recently closed, so "resolved" can be shown rather than inferred
 * from a row disappearing.
 */
export function subscribeMyRequests(
  onData: (tickets: RequestTicket[]) => void,
  onHealth?: (health: LiveHealth) => void
): Unsubscribe {
  const mine = (statuses: string[], dir: "asc" | "desc", cap?: number) => () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return null;
    const parts = [
      where("requesterId", "==", uid),
      where("status", "in", statuses),
      orderBy("createdAt", dir),
      ...(cap ? [limit(cap)] : []),
    ];
    return query(collection(db, "requests"), ...parts);
  };
  return subscribePair(
    mine(ACTIVE_STATUSES, "asc"),
    mine(CLOSED_STATUSES, "desc", CLOSED_LIMIT),
    onData,
    onHealth
  );
}

/**
 * A worker's queue — every active ticket in it, oldest first, full detail incl.
 * phone, plus recently closed ones so the panel can tell a worker that the job
 * they were holding was withdrawn or already resolved.
 */
export function subscribeQueue(
  queue: QueueId,
  onData: (tickets: RequestTicket[]) => void,
  onHealth?: (health: LiveHealth) => void
): Unsubscribe {
  const inQueue = (statuses: string[], dir: "asc" | "desc", cap?: number) =>
    () => {
      const parts = [
        where("queue", "==", queue),
        where("status", "in", statuses),
        orderBy("createdAt", dir),
        ...(cap ? [limit(cap)] : []),
      ];
      return query(collection(db, "requests"), ...parts);
    };
  return subscribePair(
    inQueue(ACTIVE_STATUSES, "asc"),
    inQueue(CLOSED_STATUSES, "desc", CLOSED_LIMIT),
    onData,
    onHealth
  );
}

/**
 * The Requests tab badge: how many things are waiting on this person right now
 * — unclaimed tickets in the queue they work, plus their own tickets that just
 * closed and haven't been acknowledged. Reuses the exact queries above, so the
 * SDK shares one listener per query rather than opening a second.
 */
export function subscribeRequestsBadge(
  profile: Profile,
  onCount: (count: number) => void
): Unsubscribe {
  const worked = workedQueues(profile);
  const queueCounts = new Map<QueueId, number>();
  let mineCount = 0;
  const emit = () =>
    onCount([...queueCounts.values()].reduce((a, b) => a + b, 0) + mineCount);

  let mine: RequestTicket[] = [];
  const recount = () => {
    const dismissed = dismissedIds();
    mineCount = mine.filter((t) => isFreshlyClosed(t, dismissed)).length;
    emit();
  };
  const stopMine = subscribeMyRequests((tickets) => {
    mine = tickets;
    recount();
  });
  // Dismissing a terminal card should clear the badge immediately, not on the
  // next snapshot (dismissal is local, so no snapshot is coming).
  dismissWatchers.add(recount);

  const stopQueues = worked.map((q) =>
    subscribeQueue(q, (tickets) => {
      queueCounts.set(q, tickets.filter((t) => t.status === "open").length);
      emit();
    })
  );

  return () => {
    dismissWatchers.delete(recount);
    stopMine();
    stopQueues.forEach((stop) => stop());
  };
}
