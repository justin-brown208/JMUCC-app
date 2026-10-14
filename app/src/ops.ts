import { useEffect, useState } from "react";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type DocumentReference,
  type Query,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";

/**
 * Data for the /ops dashboard (SCHEMA.md §4, §6, §8, §9).
 *
 * Live where it's cheap: opsEvents (capped per type), ops/stats + ops/heartbeat,
 * fcmTokens (writes throttled to 15 min per device), active requests, pending
 * scheduled sends. The roster (people + last app-open) is a one-shot callable —
 * `people` and `appOpens` stay client-locked — refreshed on load or on demand.
 */

/** Events kept on screen per type; week totals come from ops/stats. */
export const FEED_LIMIT = 100;

export interface RosterPerson {
  id: string;
  fullName: string;
  role: string;
  school: string | null;
  isAdmin: boolean;
  managesAcademicQueue: boolean;
  lastOpenedAt: number | null;
}

export interface RosterSchool {
  id: string;
  name: string;
  division: number | null;
  teamLetter: string | null;
}

export interface Roster {
  people: RosterPerson[];
  schools: RosterSchool[];
  loadedAt: Date;
}

export async function fetchRoster(): Promise<Roster> {
  const call = httpsCallable<void, Omit<Roster, "loadedAt">>(functions, "getOpsRoster");
  const { data } = await call();
  return { ...data, loadedAt: new Date() };
}

export interface Device {
  id: string;
  personId: string;
  lastSeen: Date | null;
}

export interface SearchEvent {
  id: string;
  at: Date | null;
  personId: string;
  query: string;
  ok: boolean;
  model: string | null;
  fallback: boolean;
  citations: number;
  dropped: number;
  promptTokens: number;
  cachedTokens: number;
  completionTokens: number;
  cost: number | null;
  durationMs: number;
}

export interface PushEvent {
  id: string;
  at: Date | null;
  kind: string;
  refId: string;
  recipients: number;
  recipientsWithoutDevice: number;
  tokens: number;
  delivered: number;
  failed: number;
  pruned: number;
  errorCodes: Record<string, number>;
}

export interface ProblemEvent {
  id: string;
  at: Date | null;
  level: "error" | "warn";
  source: string;
  message: string;
  context: Record<string, unknown>;
}

export interface ActiveTicket {
  id: string;
  queue: string;
  requesterName: string;
  status: string;
  createdAt: Date | null;
  claimedByName: string | null;
  claimedAt: Date | null;
}

export interface PendingSend {
  id: string;
  title: string;
  body: string;
  sendAt: Date | null;
  roles: string[];
}

export type Stats = Partial<Record<
  | "searches" | "searchesFailed" | "searchesEmpty" | "searchesFallback"
  | "searchCost" | "searchPromptTokens" | "searchCachedTokens"
  | "searchCompletionTokens" | "pushes" | "pushTokens" | "pushDelivered"
  | "pushFailed" | "pushRecipientsWithoutDevice" | "errors" | "warnings",
  number
>>;

const toDate = (v: unknown): Date | null =>
  v && typeof (v as { toDate?: unknown }).toDate === "function"
    ? (v as { toDate: () => Date }).toDate()
    : null;

const num = (v: unknown): number => (typeof v === "number" ? v : 0);

export interface Live<T> {
  data: T | undefined;
  error: string | null;
}

// onSnapshot stops for good on an error (e.g. an index still building), so
// re-subscribe after a pause and say why in the meantime.
const RETRY_MS = 15000;

function describe(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  if (code === "failed-precondition") return "Index still building — retrying.";
  if (code === "permission-denied") return "Not permitted (is this account an admin?).";
  return "Lost connection — retrying.";
}

function useLiveQuery<T>(q: Query, map: (id: string, d: DocumentData) => T): Live<T[]> {
  const [state, setState] = useState<Live<T[]>>({ data: undefined, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = onSnapshot(
      q,
      (snap) => setState({ data: snap.docs.map((d) => map(d.id, d.data())), error: null }),
      (e) => {
        setState((s) => ({ data: s.data, error: describe(e) }));
        timer = setTimeout(() => setAttempt((n) => n + 1), RETRY_MS);
      }
    );
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
    // The query is built once per hook call site; `attempt` re-subscribes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);
  return state;
}

function useLiveDoc<T>(ref: DocumentReference, map: (d: DocumentData) => T): Live<T> {
  const [state, setState] = useState<Live<T>>({ data: undefined, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = onSnapshot(
      ref,
      (snap) => setState({ data: map(snap.data() ?? {}), error: null }),
      (e) => {
        setState((s) => ({ data: s.data, error: describe(e) }));
        timer = setTimeout(() => setAttempt((n) => n + 1), RETRY_MS);
      }
    );
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);
  return state;
}

const events = (type: string) =>
  query(
    collection(db, "opsEvents"),
    where("type", "==", type),
    orderBy("at", "desc"),
    limit(FEED_LIMIT)
  );

export const useDevices = () =>
  useLiveQuery<Device>(collection(db, "fcmTokens"), (id, d) => ({
    id,
    personId: String(d.personId ?? ""),
    lastSeen: toDate(d.updatedAt),
  }));

export const useStats = () =>
  useLiveDoc<Stats>(doc(db, "ops", "stats"), (d) => d as Stats);

export const useHeartbeat = () =>
  useLiveDoc<Date | null>(doc(db, "ops", "heartbeat"), (d) => toDate(d.scheduledSendsAt));

export const useSearches = () =>
  useLiveQuery<SearchEvent>(events("search"), (id, d) => ({
    id,
    at: toDate(d.at),
    personId: String(d.personId ?? ""),
    query: String(d.query ?? ""),
    ok: d.ok === true,
    model: d.model ?? null,
    fallback: d.fallback === true,
    citations: num(d.citations),
    dropped: num(d.dropped),
    promptTokens: num(d.promptTokens),
    cachedTokens: num(d.cachedTokens),
    completionTokens: num(d.completionTokens),
    cost: typeof d.cost === "number" ? d.cost : null,
    durationMs: num(d.durationMs),
  }));

export const usePushes = () =>
  useLiveQuery<PushEvent>(events("push"), (id, d) => ({
    id,
    at: toDate(d.at),
    kind: String(d.kind ?? ""),
    refId: String(d.refId ?? ""),
    recipients: num(d.recipients),
    recipientsWithoutDevice: num(d.recipientsWithoutDevice),
    tokens: num(d.tokens),
    delivered: num(d.delivered),
    failed: num(d.failed),
    pruned: num(d.pruned),
    errorCodes: (d.errorCodes ?? {}) as Record<string, number>,
  }));

export const useProblems = () =>
  useLiveQuery<ProblemEvent>(events("error"), (id, d) => ({
    id,
    at: toDate(d.at),
    level: d.level === "warn" ? "warn" : "error",
    source: String(d.source ?? ""),
    message: String(d.message ?? ""),
    context: (d.context ?? {}) as Record<string, unknown>,
  }));

export const useActiveTickets = () =>
  useLiveQuery<ActiveTicket>(
    query(
      collection(db, "requests"),
      where("status", "in", ["open", "claimed"]),
      orderBy("createdAt", "asc")
    ),
    (id, d) => ({
      id,
      queue: String(d.queue ?? ""),
      requesterName: String(d.requesterName ?? ""),
      status: String(d.status ?? ""),
      createdAt: toDate(d.createdAt),
      claimedByName: d.claimedByName ?? null,
      claimedAt: toDate(d.claimedAt),
    })
  );

export const usePendingSends = () =>
  useLiveQuery<PendingSend>(
    query(
      collection(db, "scheduledNotifications"),
      where("status", "==", "scheduled"),
      orderBy("sendAt", "asc")
    ),
    (id, d) => ({
      id,
      title: String(d.title ?? ""),
      body: String(d.body ?? ""),
      sendAt: toDate(d.sendAt),
      roles: Array.isArray(d.roles) ? d.roles : [],
    })
  );
