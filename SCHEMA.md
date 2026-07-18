# JMUCC App — Data Schema & Structure

> The source of truth for the Firestore data model and its access rules.
> Keep this in sync with `firestore.rules` and the Cloud Functions — if the
> data model changes, this doc changes in the same commit.

## Mental model
- **Collection** = a folder. **Document** = one item in it, with its own ID. **Fields** = the data inside a document.
- **Security rules** (`firestore.rules`) gate what the *client* (the phone app) may read/write.
- **Cloud Functions use the Admin SDK, which bypasses security rules entirely.** The design pattern throughout: lock the client out of anything sensitive; let Functions do sensitive work. A 6-digit PIN is the only credential, so the client is locked out of nearly everything.

## Access at a glance
| Collection | Client read | Client write | Reason |
|---|---|---|---|
| `people` | ❌ never | ❌ never | contains every PIN, admins included |
| `schools` | admins only | ❌ (console/Functions) | source for the notification school dropdown |
| `announcements` | only if addressed to you | ❌ (Functions) | your own message history |
| `fcmTokens` | ❌ | your own device | push delivery address |
| `appOpens` | ❌ | your own record | open-tracking timestamp |
| `pinAttempts` | ❌ never | ❌ never | anti-brute-force bookkeeping |

The client is almost entirely locked out by design. Nearly everything meaningful flows through Cloud Functions.

---

## 1. `people` — the roster
One document per person. **Document ID = the person's Firebase auth `uid`** (assigned when the login Function mints their custom token), so "who am I" is just the document ID once authenticated.

| Field | Type | Notes |
|---|---|---|
| `fullName` | string | e.g. "Jane Smith" |
| `role` | string | one of the 8 roles (see CLAUDE.md → User) |
| `pin` | string | 6 digits, **plaintext**, stored as a string so leading zeros survive |
| `school` | string \| null | the `schools` document ID this person belongs to; null for organizers and non-team volunteers |
| `isAdmin` | boolean | the **only** source of admin access — not the role |

**Access: fully locked — no client read, no client write, ever.** If the client could read this, it could read every PIN. Login happens in a Function: it reads the roster with the Admin SDK, matches the submitted PIN, and returns a token plus that person's own name/role/etc. The client never sees the roster.

**PIN is plaintext** (decision): simpler, and lets the OC read a PIN from the Firebase console to help someone who forgot theirs. Acceptable because the roster is never client-exposed.

---

## 2. `schools` — the 24 teams
One document per school. **Document ID = the school ID** that `people.school` points at. This is the *single source of truth* for team assignment — `division`/`teamLetter` live here and nowhere else, resolved by in-memory lookup. Correct a school here and every attached person updates instantly.

| Field | Type | Notes |
|---|---|---|
| `name` | string | e.g. "University of X" |
| `division` | number \| null | 1–6; null until the OC publishes the ceremony mapping |
| `teamLetter` | string \| null | "A"–"D" (within-division); null until published |

**Access: admins may read** (the notification composer needs the dropdown). Writes via console/Functions only.

---

## 3. `announcements` — sent notifications
One document per notification the OC sends. Written by the send Function.

| Field | Type | Notes |
|---|---|---|
| `title` | string | one of 3 presets: "Message from the Organizing Committee" / "Reminder" / "Urgent Message" |
| `body` | string | the message text |
| `silent` | boolean | the quiet toggle (suppresses sound/vibration) |
| `sentAt` | timestamp | when it was sent |
| `recipientIds` | array\<string\> | the person IDs it was actually sent to, **computed at send time** |

`recipientIds` does double duty:
- **Previous Messages / Home latest message:** the client queries announcements where `recipientIds` array-contains its own uid, newest first.
- **Open tracking:** compare each recipient's `appOpens.lastOpenedAt` against this doc's `sentAt`.

**Access: a person may read an announcement only if their uid is in `recipientIds`; admins may read all. Writes via Functions only.**

---

## 4. `fcmTokens` — push delivery addresses
One document per installed device — the address Firebase Cloud Messaging needs to deliver a push.

| Field | Type | Notes |
|---|---|---|
| `personId` | string | the owner of this device |
| `token` | string | the FCM registration token |
| `updatedAt` | timestamp | last refresh |

**No** role/school/division/teamLetter here — targeting is resolved fresh at send time (Function loads people + schools, joins in memory, filters), so a token can never carry stale team data.

**Access: the client may write its own token document; no client reads.**

---

## 5. `appOpens` — open tracking
One document per person, **ID = person ID**, holding just when they last opened Home.

| Field | Type | Notes |
|---|---|---|
| `lastOpenedAt` | timestamp | stamped each time the Home screen loads |

Kept in its own collection (rather than on the `people` doc) specifically so the roster stays a sealed no-client-write collection — this is the one thing the client needs to write, isolated here.

**Access: a person may write only their own `appOpens` document; no client reads** (only the admin tracking Function reads these).

---

## 6. `pinAttempts` — anti-brute-force
Server-only bookkeeping the login Function uses to rate-limit PIN guesses (per device/IP). The PIN is the sole credential, so an unthrottled endpoint is a guessing oracle; this throttles it (proposed: 5 attempts, then a cooldown). Exact shape TBD when the login Function is built.

**Access: fully locked — only the login Function touches it (Admin SDK).**

---

## Cross-cutting notes
- **Team resolution is always a lookup, never denormalized.** A person's division/letter = read their `school`, read that school's `division`/`teamLetter`. Done in memory (24 schools, ~500 people — trivially cheap).
- **Identity flows one way at login:** client POSTs PIN → Function validates against `people` → mints custom token (uid = person's doc ID) → client `signInWithCustomToken`. Rules then gate on `request.auth.uid`.
- **`isAdmin` checks in rules** use a `get()` on the caller's `people` doc — rules functions can read documents even though clients cannot.
