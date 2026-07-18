// ===========================================================================
// PURGE — removes ALL test data from Firestore. RUN THIS BEFORE GO-LIVE.
// Run: node purge.mjs   (from inside dev-seed/)
// Requires service-account.json in this folder — see README.md.
//
// Deletes every document whose ID starts with "test-" in the `people` and
// `schools` collections (via a document-ID range query), so it catches all
// seeded data even if seed-data.mjs was edited. Real (non-"test-") documents
// are never touched.
//
// NOTE: this does NOT clear `announcements`, `fcmTokens`, `appOpens`, or
// `pinAttempts` — those accumulate at runtime while you test the app. See
// README.md ("Full go-live cleanup") for clearing them.
// ===========================================================================

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldPath } from "firebase-admin/firestore";

const PROJECT_ID = "jmucc-app";
const PREFIX = "test-";
// High Unicode sentinel "\uf8ff": range [PREFIX, PREFIX+sentinel) matches
// every document ID that begins with PREFIX.
const RANGE_END = PREFIX + "\uf8ff";
const here = dirname(fileURLToPath(import.meta.url));
const keyPath = join(here, "service-account.json");

let credential;
if (existsSync(keyPath)) {
  credential = cert(JSON.parse(readFileSync(keyPath, "utf8")));
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  credential = applicationDefault();
} else {
  console.error("\n  No credentials found. See README.md.\n");
  process.exit(1);
}

initializeApp({ credential, projectId: PROJECT_ID });
const db = getFirestore();

async function purgeCollection(name) {
  const snap = await db
    .collection(name)
    .where(FieldPath.documentId(), ">=", PREFIX)
    .where(FieldPath.documentId(), "<", RANGE_END)
    .get();

  if (snap.empty) {
    console.log(`  ${name}: nothing to purge.`);
    return 0;
  }
  const batch = db.batch();
  snap.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  console.log(`  ${name}: deleted ${snap.size} test document(s).`);
  return snap.size;
}

async function run() {
  console.log(`\n  Purging "${PREFIX}*" documents from "${PROJECT_ID}"...\n`);
  const a = await purgeCollection("people");
  const b = await purgeCollection("schools");
  console.log(`\n  Done. Removed ${a + b} test document(s) total.\n`);
}

run().catch((err) => {
  console.error("Purge failed:", err);
  process.exit(1);
});
