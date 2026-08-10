import {
  collection,
  addDoc,
  doc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { VOLUNTEER_ROLES } from "./constants";
import type { Profile } from "./auth";

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

// Which queues this person may submit to (mirrors the security rule): the 5
// volunteer roles → all three; Coaches → academic only; everyone else → none.
export function submittableQueues(profile: Profile): QueueId[] {
  if (VOLUNTEER_ROLES.includes(profile.role as never)) {
    return ["academic", "tech", "runner"];
  }
  if (profile.role === "Coach") return ["academic"];
  return [];
}

// Which single queue this person works, if any.
export function workedQueue(profile: Profile): QueueId | null {
  if (profile.role === "Tech Volunteer") return "tech";
  if (profile.role === "Runner") return "runner";
  if (profile.managesAcademicQueue) return "academic";
  return null;
}

// Phone is typed once and kept on the device.
const PHONE_KEY = "jmucc.phone";
export const savedPhone = (): string => localStorage.getItem(PHONE_KEY) ?? "";
export const savePhone = (phone: string): void =>
  localStorage.setItem(PHONE_KEY, phone);

function toTicket(d: QueryDocumentSnapshot<DocumentData>): RequestTicket {
  const x = d.data();
  const ts = x.createdAt as Timestamp | undefined;
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
    createdAt: ts?.toDate?.() ?? null,
    claimedBy: (x.claimedBy as string | null) ?? null,
  };
}

// --- Requester actions ---

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

export async function cancelRequest(id: string): Promise<void> {
  await updateDoc(doc(db, "requests", id), {
    status: "canceled",
    closedAt: serverTimestamp(),
  });
}

// --- Worker actions ---

export async function claimRequest(id: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  await updateDoc(doc(db, "requests", id), {
    status: "claimed",
    claimedBy: uid,
    claimedAt: serverTimestamp(),
  });
}

export async function resolveRequest(id: string): Promise<void> {
  await updateDoc(doc(db, "requests", id), {
    status: "resolved",
    closedAt: serverTimestamp(),
  });
}

export async function dropRequest(id: string): Promise<void> {
  await updateDoc(doc(db, "requests", id), {
    status: "open",
    claimedBy: null,
    claimedAt: null,
  });
}

// --- Live subscriptions (persistent cache → instant paint) ---

// The requester's own still-active tickets, with their live position.
export function subscribeMyRequests(
  onData: (tickets: RequestTicket[]) => void,
  onError?: (e: unknown) => void
): Unsubscribe {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    onData([]);
    return () => {};
  }
  const q = query(
    collection(db, "requests"),
    where("requesterId", "==", uid),
    where("status", "in", ["open", "claimed"]),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map(toTicket)),
    (e) => {
      console.error("My requests subscribe error:", e);
      onError?.(e);
    }
  );
}

// A worker's queue — the active tickets, oldest first (full detail incl. phone).
export function subscribeQueue(
  queue: QueueId,
  onData: (tickets: RequestTicket[]) => void,
  onError?: (e: unknown) => void
): Unsubscribe {
  const q = query(
    collection(db, "requests"),
    where("queue", "==", queue),
    where("status", "in", ["open", "claimed"]),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map(toTicket)),
    (e) => {
      console.error("Queue subscribe error:", e);
      onError?.(e);
    }
  );
}
