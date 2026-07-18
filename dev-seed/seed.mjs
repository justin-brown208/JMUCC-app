// ===========================================================================
// SEED — writes the test schools + people into Firestore. DEV ONLY.
// Run: node seed.mjs   (from inside dev-seed/, after `npm install`)
// Requires service-account.json in this folder — see README.md.
// ===========================================================================

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { schools, people } from "./seed-data.mjs";

const PROJECT_ID = "jmucc-app";
const here = dirname(fileURLToPath(import.meta.url));
const keyPath = join(here, "service-account.json");

// Credentials: prefer the local service-account.json; fall back to ADC if the
// GOOGLE_APPLICATION_CREDENTIALS env var is set.
let credential;
if (existsSync(keyPath)) {
  credential = cert(JSON.parse(readFileSync(keyPath, "utf8")));
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  credential = applicationDefault();
} else {
  console.error(
    "\n  No credentials found.\n" +
    "  Put a service-account.json in this folder (see README.md), then re-run.\n"
  );
  process.exit(1);
}

initializeApp({ credential, projectId: PROJECT_ID });
const db = getFirestore();

async function run() {
  const batch = db.batch();

  for (const { id, ...data } of schools) {
    batch.set(db.collection("schools").doc(id), data);
  }
  for (const { id, ...data } of people) {
    batch.set(db.collection("people").doc(id), data);
  }

  await batch.commit();

  console.log(`\n  Seeded ${schools.length} schools and ${people.length} people into "${PROJECT_ID}".\n`);
  console.log("  Test PINs (dev only):");
  for (const p of people) {
    const tag = p.isAdmin ? " [ADMIN]" : "";
    const team = p.school ? `  @ ${p.school}` : "";
    console.log(`    ${p.pin}  ${p.role}${tag}  — ${p.fullName}${team}`);
  }
  console.log("\n  Purge before go-live:  node purge.mjs\n");
}

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
