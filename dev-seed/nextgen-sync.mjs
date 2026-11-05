// ===========================================================================
// NEXTGEN SYNC — makes the live `people` collection match nextgen-roster.mjs.
// Run:  node nextgen-sync.mjs        (add --apply to write; default is a dry run)
//
// The non-destructive sibling of nextgen-seed.mjs, for roster corrections once
// people may be using the app: it never touches messages, device registrations
// or tickets, and everyone keeps the PIN already in Firestore. Newcomers get a
// fresh random PIN unique across the whole collection. Removes `ng-` people no
// longer on the roster. Rewrites nextgen-pins.csv (not in git).
// ===========================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { people } from "./nextgen-roster.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const apply = process.argv.includes("--apply");

initializeApp({
  credential: cert(JSON.parse(readFileSync(join(here, "service-account.json"), "utf8"))),
  projectId: "jmucc-app",
});
const db = getFirestore();

const team = (p) =>
  p.teamNumber == null ? "" : p.wave ? `#${p.teamNumber}${p.wave}` : `Room #${p.teamNumber}`;

async function run() {
  const snap = await db.collection("people").get();
  const live = new Map(snap.docs.map((d) => [d.id, d.data()]));
  const batch = db.batch();
  const rows = ["pin,id,fullName,role,team,flags"];
  const usedPins = new Set([...live.values()].map((p) => p.pin));

  for (const { id, ...want } of people) {
    let have = live.get(id);
    if (!have) {
      let pin;
      do pin = String(randomInt(100000, 1000000)); while (usedPins.has(pin));
      usedPins.add(pin);
      have = { pin };
      console.log(`  add    ${id} (${want.role})`);
      batch.set(db.collection("people").doc(id), { ...want, pin });
      rows.push([pin, id, want.fullName, want.role, team(want), ""].join(","));
      continue;
    }
    if (!have.pin) throw new Error(`${id} has no live PIN.`);
    const changed = Object.keys(want).filter(
      (k) => JSON.stringify(have[k]) !== JSON.stringify(want[k])
    );
    if (changed.length) {
      console.log(`  update ${id}: ` + changed.map((k) =>
        `${k} ${JSON.stringify(have[k])} -> ${JSON.stringify(want[k])}`).join(", "));
      batch.set(db.collection("people").doc(id), want, { merge: true });
    }
    const flags = [want.isAdmin && "admin", ...want.worksQueues.map((q) => `works ${q}`)]
      .filter(Boolean).join(" + ");
    rows.push([have.pin, id, want.fullName, want.role, team(want), flags].join(","));
  }

  const onRoster = new Set(people.map((p) => p.id));
  for (const id of live.keys()) {
    if (id.startsWith("ng-") && !onRoster.has(id)) {
      console.log(`  remove ${id}`);
      batch.delete(db.collection("people").doc(id));
    }
  }

  if (!apply) {
    console.log("\n  Dry run — nothing written. Re-run with --apply.\n");
    return;
  }
  await batch.commit();
  writeFileSync(join(here, "nextgen-pins.csv"), rows.join("\n") + "\n");
  console.log(`\n  Applied. Roster is ${people.length} people.\n`);
}

run().catch((err) => {
  console.error("NextGen sync failed:", err);
  process.exit(1);
});
