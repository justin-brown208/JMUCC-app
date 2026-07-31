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
| `requests` | your own + (managers: your queue) | create own; cancel own; managers claim/resolve | help-desk queue tickets |

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
| `managesAcademicQueue` | boolean | grants access to the Academic request queue (the one VP Academics). Same flag-pattern as `isAdmin`; independent of role. Optional — absent/false for everyone else |

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
| `title` | string | one of 3 presets: "Message" / "Announcement" / "Reminder" |
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

## 6. `requests` — help-desk queue tickets
One document per ticket. A **generalized queue**: the same shape serves three
queues, distinguished by the `queue` field. All tickets are "call me" style — an
optional short note plus a phone number to reach the requester.

| Field | Type | Notes |
|---|---|---|
| `queue` | string | `"academic"` \| `"tech"` \| `"runner"` |
| `requesterId` | string | the requester's person id (== their uid) |
| `requesterName` | string | denormalized from the roster so the manager can see who to call without reading `people`; validated against the roster on create |
| `phone` | string | number to call back; saved locally on the client so it's typed once |
| `room` | string \| null | prompted every submit, may be blank |
| `description` | string \| null | optional, short (≤ ~200 chars) |
| `status` | string | `"open"` → `"claimed"` → `"resolved"`, or `"canceled"`. A worker may also **release** `"claimed"` → `"open"` (un-claim, back into the pool) |
| `position` | number \| null | live FIFO rank among still-active tickets in the queue; **computed server-side**; null once closed |
| `createdAt` | timestamp | submit time; the FIFO ordering key |
| `claimedBy` | string \| null | manager's person id, set on claim |
| `claimedAt` | timestamp \| null | |
| `closedAt` | timestamp \| null | set on resolve or cancel |

**Queues & who works them** (config is hardcoded — static like the school list):
| Queue | Worked by | Submitters |
|---|---|---|
| `academic` | the person with `managesAcademicQueue == true` (one VP) | Coaches **and** all volunteer roles |
| `tech` | anyone with role *Tech Volunteer* | volunteer roles only |
| `runner` | anyone with role *Runner* | volunteer roles only |

("Volunteer roles" = the 5 volunteer values. Delegates and Organizers don't submit. Coaches submit to `academic` only.)

**Position** = the count of still-active (`open`/`claimed`) tickets in the same
queue with an earlier `createdAt`, +1 (1 = you're next). A manager may work
out of FIFO order, but position always reflects creation order among what's still
active, so a requester's number only ever drops. Recomputed by a Firestore-trigger
Function whenever a ticket in the queue is created/closed (guarded so position-only
writes don't re-trigger it).

**Notifications** (FCM): on **create** → push the queue's manager(s); on **claim**
and **resolve** → push the requester. Sent from the same trigger. **Release is
silent** — no push (the requester keeps their position, so there's nothing to
tell them).

**Access:**
- **Create:** a requester may create a ticket where `requesterId == uid`, `status == "open"`, manager/position/timestamp fields empty, **and** their role is allowed to submit to that `queue` (checked via `get()` on their `people` doc: Coach → `academic` only; volunteer roles → any). `requesterName` must match their roster name.
- **Read:** the requester may read their **own** tickets; a **manager** may read tickets in the queue they work (role match for tech/runner, `managesAcademicQueue` for academic — resolved via `get()`).
- **Cancel:** the requester may update **only** their own still-open/claimed ticket to `status: "canceled"` (+ `closedAt`); no other fields.
- **Claim/release/resolve:** a manager of the ticket's queue may transition `open → claimed` (setting `claimedBy == uid`, only when currently `open` — this makes claiming atomic so two workers can't grab the same ticket), `claimed → resolved`, and **release** `claimed → open` (clearing `claimedBy`/`claimedAt` so the ticket returns to the pool). Any manager of the queue may release — not only the one holding it — so an abandoned claim can be freed.
- No client may change `queue`, `requesterId`, `createdAt`, or `position`.

---

> **No `pinAttempts` / rate-limiting.** We deliberately do **not** throttle or
> lock out PIN attempts (decision 2026-07-18). Trade-off accepted: an unthrottled
> endpoint can be brute-forced by a script (500 live PINs in a 6-digit space ≈ 1
> in 2,000 guesses), but this is a low-value one-week event and a throttle is
> cheap to add later if ever needed. The login Function just validates and mints
> a token — it keeps no attempt bookkeeping.

## Cross-cutting notes
- **Team resolution is always a lookup, never denormalized.** A person's division/letter = read their `school`, read that school's `division`/`teamLetter`. Done in memory (24 schools, ~500 people — trivially cheap).
- **Identity flows one way at login:** client POSTs PIN → Function validates against `people` → mints custom token (uid = person's doc ID) → client `signInWithCustomToken`. Rules then gate on `request.auth.uid`.
- **`isAdmin` checks in rules** use a `get()` on the caller's `people` doc — rules functions can read documents even though clients cannot.
