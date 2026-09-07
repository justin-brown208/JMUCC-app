# dev-seed — TEST DATA TOOLING (DELETE BEFORE GO-LIVE)

> ⚠️ **This entire folder is throwaway, development-only tooling.**
> It exists so we can put fake people and fake schools into Firestore and
> exercise login, notification targeting, the calendar, and the request queues
> before the real roster exists. **None of this ships to production.** See
> "Go-live" below.

Everything it creates has an ID starting with **`test-`**, so it is easy to spot
in the Firebase console and safe to bulk-delete.

---

## What it creates

This is built to run [`TESTING.md`](../TESTING.md), which has two parts needing
**different app roles for the same 10 people**.

- **3 schools**, ceremony mapping already filled in so team resolution works end
  to end: Alpha (Div 1 / Team A), Beta (Div 2 / Team B), Crossfield (Div 1 /
  Team B). Crossfield exists to decorrelate division from team letter — with
  only Alpha and Beta, "division 1" and "letter A" select the identical people,
  so a swapped field would pass every test.
- **One of two casts of 11 people**, chosen when you run the seeder:
  - `part1` (PINs `100001`+) — notification targeting: delegates spread across
    all three schools, two coaches, a Team Ambassador, three teamless volunteers
    as the negative control, one `isAdmin` sender, one unmanned 5th volunteer role.
  - `part2` (PINs `200001`+) — runner / tech queues: three tech volunteers, two
    runners, three pure-submitter volunteers, a coach, a delegate, and an
    unmanned academic-queue holder.

**Only one cast is in Firestore at a time.** Seeding a cast deletes every other
`test-` person. They cannot coexist: both use the same role values, so a Part 1
send targeting "Delegate" would also match the Part 2 delegate and every
expected recipient count in TESTING.md Part 1 would be wrong — and that count is
itself under test.

Exact data lives in [`seed-data.mjs`](seed-data.mjs). The real roster gets
proper PINs later.

---

## One-time setup

### 1. Get a service account key (the admin credential)

The scripts write to Firestore with the Firebase Admin SDK, which needs a
service account key — a JSON file that authenticates as the project.

1. Open the Firebase console → **Project settings** (gear icon) → **Service
   accounts** tab.
   Direct link: https://console.firebase.google.com/project/jmucc-app/settings/serviceaccounts/adminsdk
2. Click **Generate new private key** → **Generate key**. A JSON file downloads.
3. Rename it to **`service-account.json`** and put it in **this folder**
   (`dev-seed/`).

> 🔒 This key is a full-access credential. It is already git-ignored (see
> `.gitignore` here and the root one). **Never commit it, never share it.**

### 2. Install dependencies

```bash
cd dev-seed
npm install
```

---

## Run it

**Seed** (add the test data — pick the cast for the part you're running):

```bash
node seed.mjs part1     # or: npm run seed:part1
node seed.mjs part2     # or: npm run seed:part2
```

It prints the schools plus a cheat sheet of PIN → which tester holds it → who
they are in the app. Re-running is safe, and switching casts mid-session is just
running the other command (then everyone logs out and back in).

**Purge** (remove the test data — see Go-live):

```bash
node purge.mjs
# or: npm run purge
```

---

## Go-live: removing all of this

Before the event goes live for the final time, do **both**:

### 1. Purge the seeded documents from Firestore

```bash
cd dev-seed
node purge.mjs
```

This deletes every `test-`-prefixed document in `people` and `schools`. Real
(non-`test-`) documents are never touched. Verify in the console that no
`test-` documents remain.

### 2. Full go-live cleanup (the runtime test data too)

While testing the app, other collections fill up with test entries that
`purge.mjs` does **not** touch:

- `announcements` — test notifications you sent
- `fcmTokens` — device tokens from test logins
- `appOpens` — open-tracking timestamps from test logins
- `pinAttempts` — rate-limit records from test logins

Clear these in the Firebase console (Firestore → open each collection → delete
documents), or ask Claude to extend `purge.mjs` to wipe them. They contain no
real data, but a clean slate before go-live is the safe move.

### 3. Delete this folder

```bash
rm -rf dev-seed
```

Nothing else in the app imports from here, so removing it is clean.

---

## Files

| File | Purpose |
|---|---|
| `seed-data.mjs` | The test schools + people (single source of truth) |
| `seed.mjs` | Writes the data to Firestore |
| `purge.mjs` | Deletes all `test-` docs from `people` + `schools` |
| `package.json` | Deps (`firebase-admin`) + `seed`/`purge` scripts |
| `.gitignore` | Keeps `service-account.json` and `node_modules` out of git |
| `service-account.json` | **You add this.** Admin credential. Never committed. |
