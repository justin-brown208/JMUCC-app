import {
  collection,
  query,
  where,
  orderBy,
  limit as fbLimit,
  onSnapshot,
  Timestamp,
  type QueryConstraint,
  type Unsubscribe,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db, auth } from "./firebase";

export interface Message {
  id: string;
  title: string;
  body: string;
  sentAt: Date | null;
}

function toMessage(d: QueryDocumentSnapshot<DocumentData>): Message {
  const data = d.data();
  const ts = data.sentAt as Timestamp | undefined;
  return {
    id: d.id,
    title: (data.title as string) ?? "",
    body: (data.body as string) ?? "",
    sentAt: ts?.toDate?.() ?? null,
  };
}

/**
 * Subscribe to the announcements addressed to the signed-in person, newest
 * first. Pass `max` to cap the count (Home wants just the latest).
 *
 * With the persistent cache enabled (firebase.ts), the first callback fires
 * immediately from local cache on repeat visits — no waiting on the network —
 * then updates from the server, and again whenever a new announcement lands.
 * Returns an unsubscribe to call on unmount.
 *
 * The `array-contains uid` + `orderBy sentAt` query is what the security rule
 * permits, and uses the composite index in firestore.indexes.json.
 */
export function subscribeMessages(
  max: number | undefined,
  onData: (messages: Message[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    onData([]);
    return () => {};
  }

  const constraints: QueryConstraint[] = [
    where("recipientIds", "array-contains", uid),
    orderBy("sentAt", "desc"),
  ];
  if (max) constraints.push(fbLimit(max));

  return onSnapshot(
    query(collection(db, "announcements"), ...constraints),
    (snap) => onData(snap.docs.map(toMessage)),
    (err) => {
      console.error("Message subscription error:", err);
      onError?.(err);
    }
  );
}
