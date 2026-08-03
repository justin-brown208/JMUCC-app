import { httpsCallable } from "firebase/functions";
import {
  collection,
  query,
  orderBy,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { functions, db } from "./firebase";
import type { SendPayload } from "./notifications";

export type ScheduleStatus =
  | "scheduled"
  | "sending"
  | "sent"
  | "canceled"
  | "failed";

export interface ScheduledItem {
  id: string;
  title: string;
  body: string;
  silent: boolean;
  roles: string[];
  divisions: number[];
  teamLetters: string[];
  school: string | null;
  sendAt: Date | null;
  status: ScheduleStatus;
  error: string | null;
}

// Create a scheduled send. Same criteria as an immediate send + a fire time.
export async function scheduleNotification(
  payload: SendPayload & { sendAtMillis: number }
): Promise<{ id: string }> {
  const call = httpsCallable<typeof payload, { id: string }>(
    functions,
    "scheduleNotification"
  );
  const { data } = await call(payload);
  return data;
}

export async function cancelScheduled(id: string): Promise<void> {
  const call = httpsCallable<{ id: string }, { ok: boolean }>(
    functions,
    "cancelScheduledNotification"
  );
  await call({ id });
}

// The Scheduled-tab list. Admins may read scheduledNotifications (per rules).
export async function loadScheduled(): Promise<ScheduledItem[]> {
  const snap = await getDocs(
    query(collection(db, "scheduledNotifications"), orderBy("sendAt", "desc"))
  );
  return snap.docs.map((d) => {
    const x = d.data();
    const ts = x.sendAt as Timestamp | undefined;
    return {
      id: d.id,
      title: (x.title as string) ?? "",
      body: (x.body as string) ?? "",
      silent: x.silent === true,
      roles: (x.roles as string[]) ?? [],
      divisions: (x.divisions as number[]) ?? [],
      teamLetters: (x.teamLetters as string[]) ?? [],
      school: (x.school as string | null) ?? null,
      sendAt: ts?.toDate?.() ?? null,
      status: (x.status as ScheduleStatus) ?? "scheduled",
      error: (x.error as string | null) ?? null,
    };
  });
}
