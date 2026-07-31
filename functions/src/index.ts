/**
 * JMUCC Cloud Functions entry point.
 *
 * Functions are added here as features land, in build order:
 *   - PIN auth (validate roster -> mint custom token)   [this step]
 *   - Notification send (resolve teams in memory at send time)
 *   - Document search (Claude primary, OpenAI fallback)
 *
 * See a full list of supported triggers at
 * https://firebase.google.com/docs/functions
 */

import {setGlobalOptions} from "firebase-functions";
import {initializeApp} from "firebase-admin/app";

// Initialize the Admin SDK once for all functions. The Admin SDK bypasses
// Firestore security rules, which is how these functions read the locked-down
// `people` roster.
initializeApp();

// Co-locate functions with the Firestore database (Montreal) for low latency,
// and cap concurrent containers to blunt cost spikes.
setGlobalOptions({region: "northamerica-northeast1", maxInstances: 10});

export {authenticateWithPin} from "./auth.js";
export {sendNotification} from "./notifications.js";
