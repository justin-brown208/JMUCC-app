import { httpsCallable } from "firebase/functions";
import {
  collection,
  query,
  orderBy,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { functions, db } from "./firebase";
import type { SendPayload, SchoolOption } from "./notifications";
import { TEAM_ROLES } from "./constants";

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

// Shift a pending send by a whole number of minutes (negative = earlier). The
// server applies the delta to its own stored time, so rapid taps compose.
// Resolves to the new send time.
export async function rescheduleScheduled(
  id: string,
  deltaMinutes: number
): Promise<Date> {
  const call = httpsCallable<
    { id: string; deltaMinutes: number },
    { sendAtMillis: number }
  >(functions, "rescheduleNotification");
  const { data } = await call({ id, deltaMinutes });
  return new Date(data.sendAtMillis);
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

// --- "Viewing as" (Admin › Scheduled) ---------------------------------------
// Would a send reach a stand-in recipient (a role, plus a team letter for team
// roles, or "" for any team)? Mirrors performSend's filters: role must match;
// division / letter / school filters each narrow, and exclude the teamless.
// Returns null for a miss, else the tags naming what the reach depends on — an
// empty list means everyone in the group gets it.

export function reachTags(
  item: ScheduledItem,
  role: string,
  letter: string,
  schools: SchoolOption[]
): string[] | null {
  if (!item.roles.includes(role)) return null;
  const filtered =
    item.divisions.length > 0 || item.teamLetters.length > 0 || item.school !== null;
  if (!filtered) return [];
  if (!TEAM_ROLES.includes(role as never)) return null; // teamless never match

  const tags: string[] = [];
  if (item.teamLetters.length > 0) {
    if (letter) {
      if (!item.teamLetters.includes(letter)) return null;
    } else {
      tags.push(`only Team ${item.teamLetters.join("/")}`);
    }
  }
  if (item.divisions.length > 0) {
    tags.push(`only Div ${item.divisions.join(", ")}`);
  }
  if (item.school !== null) {
    const s = schools.find((x) => x.id === item.school);
    // A school mapped to another letter can't contain this letter's team.
    if (letter && s?.teamLetter && s.teamLetter !== letter) return null;
    tags.push(`only ${s?.name ?? "one school"}`);
  }
  return tags;
}
