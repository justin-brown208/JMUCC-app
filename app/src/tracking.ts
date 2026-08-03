import { httpsCallable } from "firebase/functions";
import {
  collection,
  query,
  orderBy,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { functions, db } from "./firebase";

export interface AnnouncementSummary {
  id: string;
  title: string;
  sentAt: Date | null;
}

export interface GroupStat {
  group: string;
  opened: number;
  total: number;
  openedNames: string[];
  pendingNames: string[];
}

export interface TrackingResult {
  announcementId: string;
  title: string;
  sentAt: number | null;
  overall: { opened: number; total: number };
  byRole: GroupStat[];
  byTeam: GroupStat[];
}

// The list of sent notifications for the tracking picker. Admins may read all
// announcements (per firestore.rules), so this reads the collection directly.
export async function loadAnnouncements(): Promise<AnnouncementSummary[]> {
  const snap = await getDocs(
    query(collection(db, "announcements"), orderBy("sentAt", "desc"))
  );
  return snap.docs.map((d) => {
    const x = d.data();
    const ts = x.sentAt as Timestamp | undefined;
    return {
      id: d.id,
      title: (x.title as string) ?? "",
      sentAt: ts?.toDate?.() ?? null,
    };
  });
}

// The open-tracking breakdown for one notification (computed server-side).
export async function getMessageTracking(
  announcementId: string
): Promise<TrackingResult> {
  const call = httpsCallable<{ announcementId: string }, TrackingResult>(
    functions,
    "getMessageTracking"
  );
  const { data } = await call({ announcementId });
  return data;
}
