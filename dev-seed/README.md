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

This is built to run [`TESTING.md`](../TESTING.md): **one cast of 10 people,
seeded once**, covering both the notification-targeting part and the
request-queue part. Nobody swaps PINs mid-session and there is no reseed
between the parts.

- **3 schools**, ceremony mapping already filled in so team resolution works end
  to end: Alpha (Div 1 / Team A), Beta (Div 2 / Team B), Crossfield (Div 1 /
  Team B). Crossfield exists to decorrelate division from team letter — with
  only Alpha and Beta, "division 1" and "letter A" select the identical people,
  so a swapped field would pass every test.
- **10 people**, PINs `100001`–`100010`, one per tester: an Organizer who is
  both the `isAdmin` sender and the academic-queue worker, two delegates, a
  coach at Crossfield, a Team Ambassador, two tech volunteers, a runner, and the
  two remaining volunteer roles as pure submitters.

Every seat is manned. Because there are no spare identities, **a send's audience
is exactly the set of phones in the room** — the confirmation-screen number can
be checked directly against who buzzes, with no reconciliation table.

All five volunteer roles are represented, which is what lets the "All
Volunteers" shortcut fail by naming a missing role rather than by coming up
short on a count. `seed-data.mjs` explains the four trade-offs that fitting both
parts into 10 seats forced.

Seeding removes every `test-` person outside the cast, so the first run of this
version also clears the retired two-cast roster (expect ~22 removed).

The `tester` column in the printed cheat sheet says who holds each PIN.

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

**Seed** (add the test data — once, before the session):

```bash
node seed.mjs       # or: npm run seed
```

It prints the schools plus a cheat sheet of PIN → which tester holds it → who
they are in the app. Re-running is safe and idempotent.

> ⚠️ **Seeding is not enough on its own — also clear the runtime collections.**
> `seed.mjs` only touches `people` and `schools`. It does *not* touch
> `requests`, `announcements`, `appOpens` or `fcmTokens`, which fill up while
> you test and **survive a reseed**. Left in place they break TESTING.md
> concretely: leftover `open`/`claimed` tickets show up in the workers' queues
> before anyone has submitted anything, which shifts every position number in
> the script, and old announcements pre-fill Previous Messages so "did the test
> message arrive?" stops being a clean yes/no.
>
> Worse, seeded document IDs get reused between roster generations, so a new
> tester can silently inherit a previous round's tickets and messages. (Seen
> 2026-09-09: the incoming Justin and Tyson inherited 13 announcements and a
> phantom open runner ticket between them.)
>
> So before a test session, clear all four collections in the Firebase console —
> or ask Claude to, as in "wipe requests, announcements, appOpens and fcmTokens".
> `scheduledNotifications` can stay unless something is still `status: pending`,
> in which case it will fire mid-session.

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
- `requests` — queue tickets from test submissions
- `scheduledNotifications` — pending/sent scheduled sends

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
