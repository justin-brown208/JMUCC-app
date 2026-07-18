/**
 * JMUCC Cloud Functions entry point.
 *
 * Functions are added here as features land, in build order:
 *   - PIN auth (validate roster -> mint custom token, rate-limited)
 *   - Notification send (resolve teams in memory at send time)
 *   - Document search (Claude primary, OpenAI fallback)
 *
 * See a full list of supported triggers at
 * https://firebase.google.com/docs/functions
 */

import {setGlobalOptions} from "firebase-functions";

// Cap concurrent containers to blunt cost spikes; per-function overrides via
// each function's own options.
setGlobalOptions({maxInstances: 10});
