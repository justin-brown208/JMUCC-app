# dev-seed — TEST DATA TOOLING (DELETE BEFORE GO-LIVE)

> ⚠️ **This entire folder is throwaway, development-only tooling.**
> It exists so we can put ~14 fake people and 2 fake schools into Firestore and
> exercise login, notification targeting, and the calendar before the real
> roster exists. **None of this ships to production.** See "Go-live" below.

Everything it creates has an ID starting with **`test-`**, so it is easy to spot
in the Firebase console and safe to bulk-delete.

---

## What it creates

- **2 schools** in different divisions/letters (Alpha = Div 1 / Team A, Beta =
  Div 2 / Team B), with the ceremony mapping already filled in so team
  resolution works end to end.
- **14 people** covering all 8 roles, with extra delegates/coaches per school so
  targeting has something to filter. One Organizer has `isAdmin: true`.

Exact data lives in [`seed-data.mjs`](seed-data.mjs). PINs are simple sequential
test values starting at **`100001`** (easy to type during development). The real
roster gets proper PINs later.

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

**Seed** (add the test data):

```bash
node seed.mjs
# or: npm run seed
```

It prints a table of test PINs → who they are when done. Re-running is safe — it
overwrites the same documents.

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
