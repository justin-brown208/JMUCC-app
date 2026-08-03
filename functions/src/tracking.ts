/**
 * Message tracking (Admin > Message Tracking, PAGES.md §8).
 *
 * For one sent notification, report how many recipients have opened the app
 * since it went out — a recipient counts as "opened" when their
 * appOpens.lastOpenedAt is at or after the announcement's sentAt. The breakdown
 * is grouped two ways (by role and by team/school) with named lists for
 * drill-down.
 *
 * This must be a Function: appOpens and people are both client-locked, so the
 * admin browser can't compute this itself.
 */

import {onCall, HttpsError} from "firebase-functions/https";
import {getFirestore, type Timestamp} from "firebase-admin/firestore";
import {assertAdmin} from "./shared.js";
import {ROLES} from "./constants.js";

interface GroupStat {
  group: string;
  opened: number;
  total: number;
  openedNames: string[];
  pendingNames: string[];
}

interface TrackingResult {
  announcementId: string;
  title: string;
  sentAt: number | null; // ms epoch, for display
  overall: {opened: number; total: number};
  byRole: GroupStat[];
  byTeam: GroupStat[];
}

const NO_TEAM = "No team";

type Bucket = {opened: string[]; pending: string[]};

export const getMessageTracking = onCall(
  async (request): Promise<TrackingResult> => {
    const db = getFirestore();
    await assertAdmin(db, request.auth?.uid);

    const announcementId = request.data?.announcementId;
    if (typeof announcementId !== "string" || announcementId === "") {
      throw new HttpsError("invalid-argument", "announcementId is required.");
    }

    const annSnap = await db
      .collection("announcements")
      .doc(announcementId)
      .get();
    if (!annSnap.exists) {
      throw new HttpsError("not-found", "That notification no longer exists.");
    }
    const ann = annSnap.data() ?? {};
    const recipientIds: string[] = Array.isArray(ann.recipientIds) ?
      ann.recipientIds :
      [];
    const sentAt = (ann.sentAt as Timestamp | undefined) ?? null;
    const sentMs = sentAt ? sentAt.toMillis() : null;

    // Load roster, school names, and open-times in parallel.
    const [peopleSnap, schoolsSnap, opensSnap] = await Promise.all([
      db.collection("people").get(),
      db.collection("schools").get(),
      db.collection("appOpens").get(),
    ]);

    const people = new Map<string, FirebaseFirestore.DocumentData>();
    for (const d of peopleSnap.docs) people.set(d.id, d.data());

    const schoolName = new Map<string, string>();
    for (const d of schoolsSnap.docs) {
      schoolName.set(d.id, (d.data().name as string) ?? d.id);
    }

    const openedMs = new Map<string, number>();
    for (const d of opensSnap.docs) {
      const ts = d.data().lastOpenedAt as Timestamp | undefined;
      if (ts) openedMs.set(d.id, ts.toMillis());
    }

    const roleGroups = new Map<string, Bucket>();
    const teamGroups = new Map<string, Bucket>();
    let overallOpened = 0;
    let overallTotal = 0;

    const add = (
      groups: Map<string, Bucket>,
      key: string,
      name: string,
      opened: boolean
    ) => {
      const b = groups.get(key) ?? {opened: [], pending: []};
      (opened ? b.opened : b.pending).push(name);
      groups.set(key, b);
    };

    for (const id of recipientIds) {
      const p = people.get(id);
      if (!p) continue; // no longer in the roster
      overallTotal++;

      const name = (p.fullName as string) ?? id;
      const last = openedMs.get(id);
      const opened = sentMs !== null && last !== undefined && last >= sentMs;
      if (opened) overallOpened++;

      add(roleGroups, (p.role as string) ?? "Unknown", name, opened);

      const team = p.school ?
        (schoolName.get(p.school) ?? (p.school as string)) :
        NO_TEAM;
      add(teamGroups, team, name, opened);
    }

    return {
      announcementId,
      title: (ann.title as string) ?? "",
      sentAt: sentMs,
      overall: {opened: overallOpened, total: overallTotal},
      byRole: toStats(roleGroups, roleOrder),
      byTeam: toStats(teamGroups, teamOrder),
    };
  });

// Turn the accumulated buckets into sorted GroupStats.
const toStats = (
  groups: Map<string, Bucket>,
  compare: (a: string, b: string) => number
): GroupStat[] =>
  [...groups.entries()]
    .map(([group, b]) => ({
      group,
      opened: b.opened.length,
      total: b.opened.length + b.pending.length,
      openedNames: b.opened.sort(),
      pendingNames: b.pending.sort(),
    }))
    .sort((a, b) => compare(a.group, b.group));

// Roles in their canonical order (constants.ts); unknowns fall to the end.
const roleOrder = (a: string, b: string): number => {
  const ia = ROLES.indexOf(a as never);
  const ib = ROLES.indexOf(b as never);
  return (ia < 0 ? ROLES.length : ia) - (ib < 0 ? ROLES.length : ib);
};

// Teams alphabetical, but "No team" always last.
const teamOrder = (a: string, b: string): number => {
  if (a === NO_TEAM) return 1;
  if (b === NO_TEAM) return -1;
  return a.localeCompare(b);
};
