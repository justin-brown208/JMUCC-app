import { httpsCallable } from "firebase/functions";
import { collection, getDocs } from "firebase/firestore";
import { functions, db } from "./firebase";

export interface SendPayload {
  title: string;
  body: string;
  silent: boolean;
  roles: string[];
  divisions?: number[];
  teamLetters?: string[];
  school?: string | null;
}

export interface SendResult {
  announcementId: string;
  recipientCount: number; // people matched
  tokenCount: number; // devices targeted
  delivered: number; // FCM successes
  failed: number; // FCM failures
}

export interface SchoolOption {
  id: string;
  name: string;
}

// Compose the send. The heavy lifting (team resolution, filtering, FCM fan-out)
// is all server-side in the sendNotification function.
export async function sendNotification(
  payload: SendPayload
): Promise<SendResult> {
  const call = httpsCallable<SendPayload, SendResult>(
    functions,
    "sendNotification"
  );
  const { data } = await call(payload);
  return data;
}

// The school dropdown source. Admins may read schools (per firestore.rules);
// everyone else is denied, so this only runs behind the isAdmin gate.
export async function loadSchools(): Promise<SchoolOption[]> {
  const snap = await getDocs(collection(db, "schools"));
  return snap.docs
    .map((d) => ({ id: d.id, name: (d.data().name as string) ?? d.id }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
