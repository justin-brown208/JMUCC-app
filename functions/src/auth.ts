/**
 * PIN authentication.
 *
 * The client POSTs a 6-digit PIN to this callable function. The function looks
 * it up in the `people` roster (Admin SDK, so it bypasses the client-facing
 * rules that keep the roster secret), mints a Firebase custom token whose uid
 * is the person's document id, and returns a minimal profile the client caches
 * for the "Hello" greeting, calendar merging, and admin/queue gating.
 *
 * The client then calls signInWithCustomToken(token); from that point on,
 * request.auth.uid === the person's document id and normal rules apply.
 *
 * No rate-limiting / lockout by design (decision 2026-07-18) — see SCHEMA.md.
 */

import {onCall, HttpsError} from "firebase-functions/https";
import * as logger from "firebase-functions/logger";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {recordProblem} from "./ops.js";

interface AuthResult {
  token: string;
  profile: {
    fullName: string;
    role: string;
    isAdmin: boolean;
    worksQueues: string[];
    wave: string | null;
    teamNumber: number | null;
  };
}

export const authenticateWithPin = onCall(
  async (request): Promise<AuthResult> => {
    const pin: unknown = request.data?.pin;

    // Validate shape before touching the database.
    if (typeof pin !== "string" || !/^\d{6}$/.test(pin)) {
      throw new HttpsError("invalid-argument", "Enter a 6-digit PIN.");
    }

    const db = getFirestore();
    const snap = await db
      .collection("people")
      .where("pin", "==", pin)
      .limit(2)
      .get();

    if (snap.empty) {
      throw new HttpsError("unauthenticated", "That PIN wasn't recognized.");
    }
    if (snap.size > 1) {
    // Roster misconfiguration: PINs must be unique. Log the ids (never the PIN)
    // and proceed with the first match so a real user is not blocked mid-event.
      logger.warn("Duplicate PIN detected", {
        matched: snap.docs.map((d) => d.id),
      });
      await recordProblem(db, "warn", "authenticateWithPin",
        "Duplicate PIN detected", {matched: snap.docs.map((d) => d.id)});
    }

    const personDoc = snap.docs[0];
    const person = personDoc.data();

    const token = await getAuth().createCustomToken(personDoc.id);

    return {
      token,
      profile: {
        fullName: person.fullName,
        role: person.role,
        isAdmin: person.isAdmin === true,
        worksQueues: Array.isArray(person.worksQueues) ?
          person.worksQueues :
          [],
        // The team lives on the person (NextGen has no schools): a Team
        // Ambassador has both, a PRC only the number of their classroom.
        wave: person.wave ?? null,
        teamNumber: person.teamNumber ?? null,
      },
    };
  });
