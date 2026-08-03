import {HttpsError} from "firebase-functions/https";
import {type Firestore} from "firebase-admin/firestore";

// Gate a callable on the caller's isAdmin flag (not role — see CLAUDE.md).
// Shared by the notification send and message-tracking functions.
export const assertAdmin = async (
  db: Firestore,
  uid: string | undefined
): Promise<void> => {
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const doc = await db.collection("people").doc(uid).get();
  if (!doc.exists || doc.data()?.isAdmin !== true) {
    throw new HttpsError(
      "permission-denied",
      "You don't have permission for this."
    );
  }
};
