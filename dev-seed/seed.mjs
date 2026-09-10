// ===========================================================================
// SEED — writes the test schools + the 10-person test cast into Firestore.
// DEV ONLY.
//
// Run:  node seed.mjs
//
// Run ONCE before the test session. There is a single cast covering all of
// TESTING.md, so there is no cast to choose and no reseed between the two
// parts. Every test- person not in the cast is removed, which is what clears
// the old two-cast roster on the first run of this version.
//
// Requires service-account.json in this folder — see README.md.
// ===========================================================================

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldPath } from "firebase-admin/firestore";
import { schools, people } from "./seed-data.mjs";

const PREFIX = "test-";
// High Unicode sentinel: [PREFIX, PREFIX+"\uf8ff") matches every test- doc ID.
const RANGE_END = PREFIX + "\uf8ff";

const PROJECT_ID = "jmucc-app";
const here = dirname(fileURLToPath(import.meta.url));
const keyPath = join(here, "service-account.json");

// Earlier versions took a cast argument (part1 / part2 / all). There is only
// one cast now, so accept and ignore those rather than failing on muscle memory
// or a stale npm script.
const legacyArg = (process.argv[2] || "").toLowerCase();
if (["part1", "part2", "all"].includes(legacyArg)) {
  console.log(
    `\n  Note: "${legacyArg}" is no longer a thing — there is one 10-person cast\n` +
    "  covering all of TESTING.md. Seeding it.\n"
  );
}

const cast = people;

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

const schoolName = (id) => schools.find((s) => s.id === id)?.name ?? id;

async function run() {
  const keep = new Set(cast.map((p) => p.id));

  // Remove every OTHER test- person first, by query rather than by known ID.
  // Doing it by ID would silently leave behind people seeded by an earlier
  // version of this file — including the whole retired two-cast roster — who
  // would still match role targeting and quietly corrupt the expected counts.
  const stale = await db
    .collection("people")
    .where(FieldPath.documentId(), ">=", PREFIX)
    .where(FieldPath.documentId(), "<", RANGE_END)
    .get();

  const batch = db.batch();

  for (const { id, ...data } of schools) {
    batch.set(db.collection("schools").doc(id), data);
  }
  // `tester` is session bookkeeping for the console cheat sheet only — it is
  // stripped here and never written to Firestore.
  for (const { id, tester, ...data } of cast) {
    batch.set(db.collection("people").doc(id), data);
  }
  let removed = 0;
  for (const doc of stale.docs) {
    if (!keep.has(doc.id)) {
      batch.delete(doc.ref);
      removed++;
    }
  }

  await batch.commit();

  console.log(
    `\n  Seeded ${schools.length} schools and ${cast.length} people into "${PROJECT_ID}".` +
    `\n  Removed ${removed} other test- person document(s).` +
    (removed > 0
      ? "\n  (Expect ~22 removed on the first run of the single-cast version —" +
        "\n   that is the retired Part 1 / Part 2 roster being cleared out.)"
      : "")
  );

  console.log("\n  Schools:");
  for (const s of schools) {
    console.log(`    ${s.name.padEnd(22)} division ${s.division}  /  team ${s.teamLetter}`);
  }

  console.log("\n  Who logs in with what — one PIN each, for the whole session:");
  for (const p of cast) {
    const who = (p.tester ?? "—").padEnd(9);
    const flags =
      (p.isAdmin ? " [ADMIN]" : "") +
      (p.managesAcademicQueue ? " [ACADEMIC QUEUE]" : "") +
      (p.tester ? "" : " (unmanned)");
    const team = p.school ? `  @ ${schoolName(p.school)}` : "";
    console.log(`    ${p.pin}  ${who}  ${p.fullName.padEnd(16)} ${p.role}${team}${flags}`);
  }

  console.log("\n  Purge before go-live:  node purge.mjs\n");
}

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
