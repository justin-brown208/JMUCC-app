// ===========================================================================
// SEED — writes the test schools + ONE cast of test people into Firestore.
// DEV ONLY.
//
// Run:  node seed.mjs part1     (notification targeting — TESTING.md Part 1)
//       node seed.mjs part2     (runner / tech queues   — TESTING.md Part 2)
//
// Only one cast exists in Firestore at a time: seeding a cast REMOVES the other
// one. Both casts use the same role values, so if they coexisted a Part 1 send
// targeting "Delegate" would also match the Part 2 delegate, and every expected
// recipient count in TESTING.md Part 1 would be wrong.
//
// Requires service-account.json in this folder — see README.md.
// ===========================================================================

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldPath } from "firebase-admin/firestore";
import { schools, peopleP1, peopleP2 } from "./seed-data.mjs";

const PREFIX = "test-";
// High Unicode sentinel: [PREFIX, PREFIX+"\uf8ff") matches every test- doc ID.
const RANGE_END = PREFIX + "\uf8ff";

const PROJECT_ID = "jmucc-app";
const here = dirname(fileURLToPath(import.meta.url));
const keyPath = join(here, "service-account.json");

const CASTS = {
  part1: { label: "PART 1 — notification targeting", cast: peopleP1 },
  part2: { label: "PART 2 — runner / tech queues",   cast: peopleP2 },
  all:   { label: "BOTH CASTS",                      cast: [...peopleP1, ...peopleP2] },
};

const which = (process.argv[2] || "").toLowerCase();
if (!CASTS[which]) {
  console.error(
    "\n  Usage: node seed.mjs part1 | part2 | all\n\n" +
    "    part1  notification targeting  (PINs 100001+)\n" +
    "    part2  runner / tech queues    (PINs 200001+)\n" +
    "    all    both casts at once      (no reseed between parts)\n\n" +
    "  Seeding a cast removes every other test- person. With `all`, note that\n" +
    "  Part 2 identities still count toward Part 1 audience totals — TESTING.md\n" +
    "  lists the both-casts numbers.\n"
  );
  process.exit(1);
}
const { label, cast } = CASTS[which];

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
  // Doing it by ID would only catch the sibling cast and would silently leave
  // behind people seeded by an earlier version of this file — who would still
  // match role targeting and quietly corrupt the expected counts.
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
    `\n  Removed ${removed} other test- person document(s).`
  );

  console.log("\n  Schools:");
  for (const s of schools) {
    console.log(`    ${s.name.padEnd(22)} division ${s.division}  /  team ${s.teamLetter}`);
  }

  const blocks = which === "all"
    ? [["PART 1 — notification targeting", peopleP1], ["PART 2 — runner / tech queues", peopleP2]]
    : [[label, cast]];
  for (const [heading, group] of blocks) {
  console.log(`\n  ${heading} — who logs in with what:`);
  for (const p of group) {
    const who = (p.tester ?? "—").padEnd(9);
    const flags =
      (p.isAdmin ? " [ADMIN]" : "") +
      (p.managesAcademicQueue ? " [ACADEMIC QUEUE]" : "") +
      (p.tester ? "" : " (unmanned)");
    const team = p.school ? `  @ ${schoolName(p.school)}` : "";
    console.log(`    ${p.pin}  ${who}  ${p.fullName.padEnd(16)} ${p.role}${team}${flags}`);
  }
  }

  console.log("\n  Purge before go-live:  node purge.mjs\n");
}

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
