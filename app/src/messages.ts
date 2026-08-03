import {
  collection,
  query,
  where,
  orderBy,
  limit as fbLimit,
  getDocs,
  Timestamp,
  type QueryConstraint,
} from "firebase/firestore";
import { db, auth } from "./firebase";

export interface Message {
  id: string;
  title: string;
  body: string;
  sentAt: Date | null;
}

/**
 * Load the announcements addressed to the signed-in person, newest first.
 * Pass `max` to cap the count (Home wants just the latest one).
 *
 * The `array-contains` + `orderBy sentAt` query is exactly what the security
 * rule permits (uid in recipientIds), and needs the composite index in
 * firestore.indexes.json.
 */
export async function loadMessages(max?: number): Promise<Message[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];

  const constraints: QueryConstraint[] = [
    where("recipientIds", "array-contains", uid),
    orderBy("sentAt", "desc"),
  ];
  if (max) constraints.push(fbLimit(max));

  const snap = await getDocs(query(collection(db, "announcements"), ...constraints));
  return snap.docs.map((d) => {
    const data = d.data();
    const ts = data.sentAt as Timestamp | undefined;
    return {
      id: d.id,
      title: (data.title as string) ?? "",
      body: (data.body as string) ?? "",
      sentAt: ts?.toDate?.() ?? null,
    };
  });
}
