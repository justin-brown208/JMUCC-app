// ===========================================================================
// NEXTGEN SEED — replaces the whole roster with the NextGen Logistics one.
// Run:  node nextgen-seed.mjs        (from inside dev-seed/)
//
// DESTRUCTIVE by design (the project is shared with JMUCC, whose roster is
// test-only): deletes EVERY doc in people + schools, and clears the runtime
// collections (requests, announcements, appOpens, fcmTokens,
// scheduledNotifications) so no JMUCC test ticket or message bleeds in.
//
// Roster: nextgen-roster.mjs (real names — not in git).
// PINs:   nextgen-pins.csv (not in git). Generated once, random, unique; a
//         re-run reuses each person's existing PIN so handed-out PINs survive.
// ===========================================================================

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { people } from "./nextgen-roster.mjs";

const PROJECT_ID = "jmucc-app";
const here = dirname(fileURLToPath(import.meta.url));
const keyPath = join(here, "service-account.json");
const pinsPath = join(here, "nextgen-pins.csv");

const WIPE = ["people", "schools", "requests", "announcements", "appOpens",
  "fcmTokens", "scheduledNotifications"];

if (!existsSync(keyPath)) {
  console.error("\n  No service-account.json here — see README.md.\n");
  process.exit(1);
}
initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, "utf8"))),
  projectId: PROJECT_ID });
const db = getFirestore();

// id -> pin from a previous run.
function loadPins() {
  const pins = new Map();
  if (!existsSync(pinsPath)) return pins;
  for (const line of readFileSync(pinsPath, "utf8").trim().split("\n").slice(1)) {
    const [pin, id] = line.split(",");
    if (pin && id) pins.set(id, pin);
  }
  return pins;
}

function assignPins(prev) {
  const used = new Set();
  const out = new Map();
  for (const p of people) {
    const keep = prev.get(p.id);
    if (keep && !used.has(keep)) {
      out.set(p.id, keep);
      used.add(keep);
    }
  }
  for (const p of people) {
    if (out.has(p.id)) continue;
    let pin;
    do pin = String(randomInt(100000, 1000000)); while (used.has(pin));
    out.set(p.id, pin);
    used.add(pin);
  }
  return out;
}

async function wipe(name) {
  const snap = await db.collection(name).get();
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db.batch();
    snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return snap.size;
}

const team = (p) =>
  p.teamNumber == null ? "" : p.wave ? `#${p.teamNumber}${p.wave}` : `Room #${p.teamNumber}`;

async function run() {
  const ids = new Set(people.map((p) => p.id));
  if (ids.size !== people.length) throw new Error("Duplicate person id in roster.");

  for (const name of WIPE) console.log(`  wiped ${name}: ${await wipe(name)}`);

  const pins = assignPins(loadPins());
  const batch = db.batch();
  for (const { id, ...data } of people) {
    batch.set(db.collection("people").doc(id), { ...data, pin: pins.get(id) });
  }
  await batch.commit();

  const csv = ["pin,id,fullName,role,team,flags"];
  for (const p of people) {
    const flags = [p.isAdmin && "admin", ...p.worksQueues.map((q) => `works ${q}`)]
      .filter(Boolean).join(" + ");
    csv.push([pins.get(p.id), p.id, p.fullName, p.role, team(p), flags].join(","));
  }
  writeFileSync(pinsPath, csv.join("\n") + "\n");

  console.log(`\n  Seeded ${people.length} people into "${PROJECT_ID}".`);
  console.log(`  PINs written to ${pinsPath} (not in git).\n`);
}

run().catch((err) => {
  console.error("NextGen seed failed:", err);
  process.exit(1);
});
