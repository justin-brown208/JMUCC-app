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
| `scheduledNotifications` | admins only | ❌ (Functions) | pending future sends |

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
| `status` | string | `"open"` → `"claimed"` → `"resolved"`, or `"canceled"`. A worker may also **release** `"claimed"` → `"open"` (un-claim, back into the pool). **Exception — `academic`:** worked by one person (the VP), so there's no claim step; the VP resolves straight from `"open"` → `"resolved"` (no `"claimed"` state) |
| `position` | number \| null | live FIFO rank among still-active tickets in the queue; **computed server-side**; null once closed |
| `createdAt` | timestamp | submit time; the FIFO ordering key |
| `claimedBy` | string \| null | manager's person id, set on claim; cleared on release **and on cancel** |
| `claimedByName` | string \| null | denormalized roster name of the claimer, so the requester and the other workers of a shared queue can see **who** holds a ticket without reading `people`. **Written by the `onRequestWrite` trigger, never by a client** — the rules exclude the key from the claim's allowed set |
| `claimedAt` | timestamp \| null | |
| `closedBy` | string \| null | person id of whoever resolved it |
| `closedByName` | string \| null | denormalized roster name of the resolver, for the requester's "X marked your request resolved". Trigger-written, same as `claimedByName` |
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
and **resolve** → push the requester (named: "Tara has picked up your request");
on **cancel of a claimed ticket** → push the worker who was holding it, so a job
doesn't silently disappear from under them. Sent from the same trigger.
**Release is silent** — no push (the requester keeps their position, so there's
nothing to tell them), and so is cancelling a ticket nobody had picked up.

Pushes are **best-effort and secondary**. A push that fails must not affect the
data, so the trigger recomputes `position` **before** notifying and wraps the
notify in a try/catch. Every client view also renders the state change itself
(see below) — a person with notifications off, or with the app in the
foreground where the browser shows nothing, still sees what happened.

**Names are stamped server-side.** A client only knows the roster name it
cached at login, so accepting `claimedByName`/`closedByName` from it would mean
a name corrected in the console mid-event starts rejecting that person's claims.
The client writes only `claimedBy`/`closedBy` (its own uid, rule-checked); the
trigger reads `people` and writes the name. The same resolved name is used for
the push, so the notification and the ticket can't disagree.

**Closed tickets stay readable for a while — via a second query, not a wider
one.** Each client view runs **two** listeners:

- **active** — `status in ["open","claimed"]`, ordered `createdAt asc`,
  **unbounded**. This is the work, and it must never be capped: a single
  "recent tickets, newest N" query lets closed tickets crowd live ones out of
  the window, so an old still-open ticket would silently vanish from the
  worker's queue once the week's volume passed N.
- **closed** — `status in ["resolved","canceled"]`, ordered `createdAt desc`,
  hard-capped (12). Raw material for terminal cards only, which is why a cap is
  safe here.

A status-filtered active query alone would make a resolve or a cancel land as a
row silently disappearing, indistinguishable from a bug — hence the second
listener. The closed ticket stays on screen as a terminal card ("Resolved by
Tara", "Withdrawn by requester") until dismissed or ~30 minutes old. Four
composite indexes back this: `{queue,status,createdAt}` and
`{requesterId,status,createdAt}`, each in both `createdAt` directions.

**`position` is recomputed in a transaction.** Two tickets closing in the same
second give two trigger invocations; a plain read-then-write lets the one that
read first commit last, restoring a slot for an already-closed ticket and
leaving everyone behind it off by one **permanently** — position-only writes are
loop-guarded, so no later trigger corrects it. The recompute and the closing
ticket's `position: null` happen in one transaction.

**Access:**
- **Create:** a requester may create a ticket where `requesterId == uid`, `status == "open"`, manager/position/timestamp fields empty, **and** their role is allowed to submit to that `queue` (checked via `get()` on their `people` doc: Coach → `academic` only; volunteer roles → any). `requesterName` must match their roster name.
- **Read:** the requester may read their **own** tickets; a **manager** may read tickets in the queue they work (role match for tech/runner, `managesAcademicQueue` for academic — resolved via `get()`).
- **Cancel:** the requester may update **only** their own still-open/claimed ticket to `status: "canceled"` (+ `closedAt`), and may additionally **null out** `claimedBy`/`claimedByName`/`claimedAt` so a withdrawn ticket carries no half-live claim. The rule permits those three keys only when the new value is `null`, so cancel can never be used to forge or steal a claim. No other fields.
- **Claim/release/resolve:** a manager of the ticket's queue may transition `open → claimed` (setting `claimedBy == uid` — and **only** that; `claimedByName` is not in the allowed key set, because the trigger writes it — only when currently `open` — this makes claiming atomic so two workers can't grab the same ticket), `claimed → resolved` (setting `closedBy == uid`; `closedByName` is likewise trigger-written), and **release** `claimed → open` (clearing `claimedBy`/`claimedByName`/`claimedAt` so the ticket returns to the pool). Any manager of the queue may release — not only the one holding it — so an abandoned claim can be freed.
- **Resolve (academic):** the `academic` queue has a single worker (the VP), so there's no claim step — the VP may transition `open → resolved` directly (a dedicated rule branch, `queue == "academic"` only). Tech/runner still go through `claimed → resolved`.
- No client may change `queue`, `requesterId`, `createdAt`, or `position`.

---

## 7. `scheduledNotifications` — pending future sends
One document per notification the OC has scheduled but not yet sent. Stores the
compose **criteria** (never resolved recipients) plus when to fire — so targeting
resolves fresh at fire time, exactly like an immediate send.

| Field | Type | Notes |
|---|---|---|
| `title` | string | one of the 3 presets |
| `body` | string | the message text |
| `silent` | boolean | quiet toggle |
| `roles` | array\<string\> | recipient roles (the composer expands "All Volunteers") |
| `divisions` | array\<number\> | optional narrowing filter |
| `teamLetters` | array\<string\> | optional narrowing filter |
| `school` | string \| null | optional single-school filter |
| `sendAt` | timestamp | when to fire |
| `status` | string | `"scheduled"` → `"sent"`, or `"canceled"` / `"failed"` (transient `"sending"` while the poller is mid-fire — the atomic claim) |
| `createdBy` | string | admin uid who scheduled it |
| `createdAt` | timestamp | |
| `announcementId` | string \| null | the `announcements` doc created when it fired |
| `error` | string \| null | failure reason if `status == "failed"` |

**How it fires:** a scheduled Cloud Function (`runScheduledSends`, every 1 min)
queries `status == "scheduled" && sendAt <= now`, atomically claims each (a
transaction flips `scheduled → sending` so overlapping runs can't double-send),
runs the **same** targeting + FCM path as an immediate send (writing a real
`announcement`, so history + tracking work unchanged), and marks it `sent` (with
`announcementId`) or `failed` (with `error`).

**Access: admins may read** (the Scheduled tab lists them). All writes go through
Functions — **create** via the `scheduleNotification` callable (admin-gated,
validates the payload and that `sendAt` is in the future), **cancel** via the
`cancelScheduledNotification` callable (admin-gated, `scheduled → canceled` only).
No client writes.

---

## Storage — source PDFs (not Firestore)

The document-search feature (PAGES.md §4–5) reads two **static PDFs** from
Firebase Storage, uploaded once by the OC via the Firebase console before the
event:

| Object path | Meaning |
| --- | --- |
| `documents/rulebook.pdf` | Competition rulebook |
| `documents/faq.pdf` | FAQ |

**Access: `documents/**` is publicly readable, no client write** (`storage.rules`).
The content isn't secret — the viewer (PAGES.md §6) hands over the whole PDF — so
both consumers use the same object: the `searchDocuments` callable reads it
server-side via the Admin SDK, and the client viewer loads its public download
URL. Paths are hardcoded in `functions/src/search.ts` (`DOCS`) and the public
URLs in the client search config. PDFs must be **text-based** (not scanned
images) — the search extracts their text with `unpdf`, and a scan yields nothing
to quote. OC uploads both via the Firebase console; only `documents/` is exposed
(everything else in Storage is denied).

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
