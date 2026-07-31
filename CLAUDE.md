# CLAUDE.md - Project Context Bible

> This document maintains context for Claude instances working on this project.

## User Preferences
- Collaborative, iterative process — small steps, not large info dumps
- Ask before deciding — present options and wait for explicit answers
- Don't be sycophantic — push back directly when a concern doesn't hold up
- Verify commands — web search current best practices before writing

---

## Project Overview
PWA for a university case competition. Core features: push notifications, a Google Calendar-synced event schedule, and natural-language document citation search. Target: 100–500 participants across one week-long event.

---

## Entities

### User
- Person document: `fullName`, `role`, `pin`, `school` (nullable), `isAdmin` — that's the whole schema
- **Roles are a flat list of 8 values** (no parent/subtype nesting): `Delegate`, `Coach`, `Organizer`, `Presentation Room Coordinator`, `Team Ambassador`, `Tech Volunteer`, `General Volunteer`, `Runner`
- The last 5 are volunteer roles. "Volunteer" is a **UI grouping only** — it expands to those 5 values in filters; it is never stored as a role value
- **`school` is set for Delegate, Coach, and Team Ambassador; null for everyone else.** For a Team Ambassador it means "the team I'm assigned to," not "the school I attend" — same field, resolves the same way
- Auth: every individual gets their own **6-digit PIN**, pre-assigned in the roster. Entering a valid PIN fully identifies the person — no separate role/name/school selection step. No shared/open self-identification, no separate OC access code.
- **PIN is verified server-side only.** Client POSTs the PIN to a Cloud Function → function validates against the roster → mints a Firebase **custom token** → client calls `signInWithCustomToken`. Rules then gate on `request.auth.uid` like any normal Firebase app.
- **The people collection is never client-readable.** PIN matching cannot happen on the client — that would require exposing every name and PIN in the roster, admin PINs included.
- **No rate-limiting / lockout on PIN attempts** (decision 2026-07-18) — deliberately skipped for this low-value one-week event. Wrong PIN just shows an inline error; there is no cooldown and no `pinAttempts` bookkeeping. Trade-off: the endpoint is scriptable-brute-forceable; accepted, and a throttle is cheap to add later.
- **`isAdmin` is the only source of admin access** — not the `Organizer` role. Organizers get the flag set at seed time; it can be granted to any role or revoked from an Organizer without changing their role. Security rules check the flag alone.
- Onboarding is reduced to: enter PIN → done (plus first-time PWA install instructions)
- Named roster pre-seeded in Firestore via Firebase console before event
- App-open tracking is tied to the identified individual

### Team Assignment
- 24 teams, 6 divisions, 4 teams per division (letters A–D within each division)
- School list pre-seeded in Firestore via Firebase console before the event — not a UI feature
- At ceremony, OC uses admin panel to assign each school a division + letter
- **`division` and `teamLetter` live only on the school document — never copied onto a person.** A person's team is resolved by looking up their `school`. This is the single source of truth.
- Rationale: prevents stale data. OC corrects a school's division in the Firebase console and every delegate, coach, and team ambassador attached to it is instantly correct, with no fan-out to re-run.
- Anyone whose `school` is null (Organizers, non-ambassador volunteers) has no team — they're targeted by role only
- The join is done in memory (24 schools, ~500 people — trivially cheap; Firestore can't join natively)
- `division` and `teamLetter` are null on the school until OC publishes the ceremony mapping
- Errors corrected directly via Firebase console

### Document Search
- Not a chatbot — strictly single-turn: user types a natural-language question, backend returns highlighted source citations. No conversation, no history, no follow-up context.
- Output is extracted text snippets quoted verbatim from the docs, with the matching words/phrases highlighted within each snippet — no generated/paraphrased/explanatory text from the model
- Returns multiple ranked citations per query (not just one), since an answer may span more than one section
- RAG: model selects only from 2 static PDFs — the **rulebook** and a **FAQ** doc (no dynamic/live-editable document, no OC-managed Q&A store). Users can also open either PDF full-screen in a basic (off-the-shelf) viewer.
- LLM: Claude (primary), OpenAI (fallback)
- No streaming — the response is a small structured result (ranked citations), not long-form prose, so it's returned as one shot; fallback triggers if the primary model call fails
- PDFs uploaded once by OC before the event via Firebase console — not a UI feature
- At query time: Cloud Function fetches the static PDF content, passes as full context; system prompt instructs model to return only verbatim quoted spans with highlight offsets, ranked by relevance

### Calendar
- Homepage features a Google Calendar-synced event schedule, presented as a **widget** (current/soonest event large, later events as smaller entries) — not a traditional month/week calendar view, and no separate calendar page
- Calendars are split by role and by team letter (e.g. "Volunteer" calendar, "Team A" calendar) — team-letter calendars are shared across all divisions (4 total: A/B/C/D), not one per division
- A user sees the calendar(s) matching their role plus, if their `school` is set, that school's team-letter calendar (resolved via the school lookup — applies to Delegates, Coaches, and Team Ambassadors alike)
- **A "View Full Week" button** near the widget opens a **static full-week schedule image** (a poster/grid the OC provides, uploaded before the event like the PDFs) in an **off-the-shelf zoomable/pannable image viewer** — not custom-built, not generated from the calendar feed. It's the at-a-glance whole-week view the widget deliberately isn't.
- Exact calendar source mechanism (public iCal feed vs API) still TBD — see Status & Next Steps

### Notification
- OC composes and sends
- Targeting: role(s) as the primary selector, then narrowed by filters — division(s), letter(s), and/or a single specific school. Volunteer roles are targetable individually (e.g. "all Runners") via the role filter, with an "All volunteers" shortcut that selects the 5 volunteer roles at once.
- **School is a targetable filter** (send to one named school) — resolved at send time via the person's `school` field, still never denormalized onto the FCM token.
- **FCM token stores only `{ personId, token, updatedAt }`** — no denormalized role/school/division/teamLetter. At send time the Cloud Function loads people + schools, resolves teams in memory, filters, and collects matching tokens.
- Rationale: a token that cached `division` would go stale the moment OC corrected a school mapping. Resolving at send time means targeting is always correct by construction.
- **Quiet toggle** — suppresses sound/vibration; notification appears in tray and app only
- No acknowledgement or feedback features — notifications are one-way broadcasts
- **Open tracking** — each user's last home-page-open timestamp is recorded; OC sees, per notification, a high-level breakdown by group (e.g. "19/40 volunteers, 22/24 schools have opened the app since this was sent"), with drill-down to a named list per group on request

### Request / Queue
- A **generalized help-desk queue**: eligible users submit simple "call me" tickets; queue workers claim and resolve them. Same ticket shape serves all queues, keyed by a `queue` field.
- **3 queues at launch** (config hardcoded, static like the school list): `academic` (rules questions), `tech`, `runner`
- **Who works each queue:** `tech` → anyone with role *Tech Volunteer*; `runner` → anyone with role *Runner*; `academic` → the one person carrying a `managesAcademicQueue` flag (the VP Academics, an OC member). Flag-pattern mirrors `isAdmin`; "VP Academics" is not a role
- **Who submits:** Coaches → `academic` only; all 5 volunteer roles → any queue. Delegates/Organizers don't submit. Queue is fixed by the Home button tapped, never chosen on the form
- **Ticket:** optional short description (all are "call me" type), phone (saved locally on the client, typed once), room # (prompted every time, may be blank), name (auto from profile). No ticket types/categories
- **Lifecycle:** `open → claimed → resolved`, or `canceled` (by requester). Manager claims (atomic — no double-grab) and resolves; may also **release** (`claimed → open`, un-claim back into the pool — any queue worker can free an abandoned claim); requester can cancel own. Release is **not** reassign — it returns to the open pool, not to a named worker (so "no bounce/reassign" still holds)
- **Queue position:** live FIFO rank among still-active tickets, **computed server-side** and written onto each ticket (requester can't read others' PII, so the number is pushed to them, not derived client-side). Managers may work out of order; a requester's position only ever drops (release keeps the ticket active, so it doesn't change)
- **Notifications (FCM):** submit → push queue worker(s); claim & resolve → push requester; **release is silent** (nothing changes for the requester)
- **Visibility:** requester sees only their own ticket + position; the managing worker sees full details incl. phone (PII stays with the worker side)
- **UI:** Home shows per-queue submit buttons + a "My Requests" strip (live position, cancel) for submitters, and a "My Queue" worker view for those who work a queue (see `PAGES.md` §9–10). A person can be both

### Admin Panel
- Section of the main app gated by the person's `isAdmin` flag (not by role) — a navigable area with its own internal nav, entered from Home
- Sub-pages: **Compose Notification** (quiet toggle, roles-then-filters targeting) and **Message Tracking** (list of sent notifications → per-notification open-tracking breakdown with drill-down)

---

## Stack
- Frontend: React + Vite → deployed to Vercel via GitHub push (auto-deploys)
- Database: Firebase Firestore
- Push: Firebase Cloud Messaging (FCM)
- Hosting: Vercel (frontend only — not Firebase Hosting)
- Backend: Firebase Cloud Functions (Node.js) → `firebase deploy --only functions`; requires Blaze plan
- LLM: Vercel AI SDK with Claude + OpenAI keys as Cloud Function env vars
- PWA: `vite-plugin-pwa` generates manifest + service worker

---

## Platform Constraints
- No app store approval needed — PWAs install directly; only HTTPS + manifest + service worker required (all satisfied by stack)
- iOS push requires **iOS 16.4+** and install via **Safari** (Share → Add to Home Screen); no auto-prompt, so build explicit in-app install instructions for iPhone users
- Android: Chrome auto-prompts install; push works in-browser too

---

## Decision Log
- [2026-06-03] Admin via in-app panel, not Firebase Console — OC is non-technical
- [2026-06-03] School list hardcoded via Firebase console, not a UI feature — OC handles corrections via console directly
- [2026-06-03] Team letter convention: A–D within each division (not global A–X)
- [2026-06-03] LLM via Vercel AI SDK (not OpenRouter) — better streaming/React integration; Claude primary, OpenAI fallback
- [2026-06-03] No vector DB — rulebook small enough to pass as full context per query
- [2026-06-03] Named roster pre-seeded via Firebase console — identity tied to specific individuals, not just teams
- [2026-07-14] Removed acknowledgement and feedback notification features entirely — replaced with passive open-tracking (last home-page-open timestamp vs. notification sent time)
- [2026-07-14] Removed open self-ID — every individual (all roles, including OC) now gets a pre-assigned individual PIN that fully identifies them on entry; no name/role/school selection step, no separate OC access code
- [2026-07-14] Removed dynamic rulebook + OC-managed Q&A store — chatbot now cites only 1–2 static PDFs uploaded once before the event
- [2026-07-14] Added Google Calendar-synced schedule to homepage — calendars split by role and by team letter (A–D, shared across divisions, not per-division)
- [2026-07-14] Volunteers can be optionally tagged with a team letter ("team ambassador") for calendar purposes only — role stays "volunteer"
- [2026-07-14] Chatbot redefined as non-conversational document search — single-turn query returns multiple ranked, highlighted verbatim citations from the static PDFs; no generated prose, no streaming (response is a small structured result, not long-form text)
- [2026-07-15] Roles expanded to a flat list of 8 (Delegate, Coach, Organizer, + 5 volunteer roles) — flat rather than role+subtype; "Volunteer" is a UI filter grouping, never a stored value
- [2026-07-15] Admin access driven solely by an `isAdmin` flag, not the Organizer role — single check in security rules, and access can be granted/revoked without changing someone's role
- [2026-07-15] `division`/`teamLetter` live only on the school doc and are resolved by in-memory lookup — never denormalized onto people or FCM tokens. Chosen specifically so console corrections propagate instantly; denormalizing would silently strand stale team data during the event.
- [2026-07-15] Team Ambassadors carry a `school` value (meaning "the team I'm assigned to"), so they inherit division+letter through the same lookup as delegates/coaches — this removed the need for any per-person division/teamLetter fields
- [2026-07-15] PINs are 6-digit, uniform for all roles (was 4) — with ~500 people, 4 digits meant ~5% of random guesses hit a live account (~20 tries to land on someone, admins included); 6 digits drops that to ~0.05%. Uniform length beats admin-only 6-digit: simpler to explain and distribute, same protection.
- [2026-07-15] PIN auth via Cloud Function + Firebase custom token; roster never client-readable. **Consequence: Cloud Functions gate the first feature, not just document search** — Blaze upgrade moved to the front of the build order.
- [2026-07-18] **No PIN rate-limiting / lockout** — dropped the earlier "must rate-limit" requirement and the `pinAttempts` collection. Judged not worth it for a low-value one-week event; wrong PIN shows an inline error only. Reversible later.
- [2026-07-17] School added as a notification target (send to one named school), resolved at send time — extends the earlier role+division+letter targeting; token still stores no denormalized fields
- [2026-07-17] Notification title is a required pick from a fixed preset set (Message from OC / Reminder / Urgent), not free text; recipients chosen as roles-then-narrowing-filters; Send shows a plain-language confirmation of the audience
- [2026-07-17] FAQ reintroduced as a second *static* PDF (not the old OC-managed live Q&A store) — document search now cites rulebook + FAQ; both also openable full-screen in an off-the-shelf PDF viewer
- [2026-07-17] Calendar is a home-screen widget (next/current event prominent, later events smaller), not a full calendar view; PIN login persists permanently until logout
- [2026-07-27] Added a **generalized request/queue** feature (new `requests` collection) — 3 hardcoded queues (academic/tech/runner); workers by role (Tech Volunteer, Runner) or by a `managesAcademicQueue` flag (VP Academics, not a role); coaches submit to academic only, volunteers to any; "call me" tickets with locally-saved phone; live FIFO position computed server-side and pushed (requester can't read others' PII); claim is atomic; pushes on submit/claim/resolve
- [2026-07-31] Queue workers can **release ("drop") a claimed ticket** back to the queue (`claimed → open`, clears claimedBy/claimedAt) — any queue worker can free an abandoned claim; **silent** (no requester push), position unchanged. Distinct from the earlier-rejected "bounce"/reassign: it returns to the open pool, not to a named worker
- [2026-07-31] Added a **"View Full Week"** button by the schedule widget — opens a static full-week schedule **image** (OC-supplied, uploaded before the event) in an **off-the-shelf zoomable/pannable image viewer** (not custom-built, not generated from the calendar feed); new `PAGES.md` §11

---

## Repo Structure
- `app/` — React + Vite + PWA frontend (deployed to Vercel); `vite-plugin-pwa` wired in `app/vite.config.ts`, PWA icons in place
- `functions/` — Firebase Cloud Functions (Node.js/TypeScript; deployed via `firebase deploy --only functions`)
- `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `.firebaserc` — Firebase config at root
- `PAGES.md` — per-page UI spec (11 screens: Registration, Home, Previous Messages, Rules Search, Rules Results, PDF Viewer, Admin › Compose, Admin › Tracking, Submit a Request, My Queue, Full Week Schedule); the build-against reference for frontend work
- `OVERVIEW.md` — plain-language, non-developer tour of the app (what each screen does, what users can do/learn, per-role breakdown); no backend detail. Keep user-facing behavior in sync with `PAGES.md`
- `DESIGN.md` — the design language: semantic color tokens, 2 type roles (Montserrat body + TradeGothic CondEighteen Bold display), 9px-radius surface primitive whose outline color encodes state, navy→black gradient. Consult before building any UI. (Display font is licensed — needs a webfont or condensed-bold fallback.)
- **`SCHEMA.md` — the source of truth for the Firestore data model (6 collections: `people`, `schools`, `announcements`, `fcmTokens`, `appOpens`, `requests`) and their client access rules. ALWAYS consult it before touching Firestore, `firestore.rules`, or any Cloud Function, and update it in the SAME commit as any data-model change so it never drifts from `firestore.rules`.**
- Single root `.gitignore` covers both subprojects (no per-directory gitignores)
- Note: `app/` and `functions/` keep separate `package.json`/`tsconfig.json` — different runtimes (browser vs Node), intentional

## Status & Next Steps
**Done:** Scaffold (React+Vite+PWA, Cloud Functions), single root `.gitignore`, PWA icons, Blaze upgrade, DB created (Standard edition, `northamerica-northeast1`/Montreal), `firestore.rules` written+audited+**deployed live**, `SCHEMA.md` = data-model source of truth, `dev-seed/` seeding tooling built + **seed run** (test PINs 100001–100014), **PIN auth function `authenticateWithPin` built + deployed + verified live** (mints custom token, resolves team via school lookup, returns profile; no rate-limiting), **Firebase Auth enabled** (Console Get-started — custom-token redeem now works), **web app registered** (config in `app/src/firebase.ts` — public identifiers), **display font self-hosted** (`app/public/fonts/*.woff2`, `--font-display` token; TTF source in `app/fonts-src/`, out of the deploy), **PIN entry client built + verified end-to-end** (Registration → Home stub, DESIGN tokens in `index.css`)
**Step 5 (FCM notifications) — in progress.** DONE: (a) **send function `sendNotification` built + deployed + targeting verified live** (`functions/src/notifications.ts` + shared `constants.ts`; admin-gated on `isAdmin`; roles + division/letter/school filters with in-memory team resolution; teamless correctly excluded by team filters; empty-match blocked; writes `announcement` w/ `recipientIds`; FCM multicast in 500-batches + stale-token prune; quiet toggle via `webpush.notification.silent`). (b) **Client push registration built + verified end-to-end — real banner delivered** (`app/src/fcm.ts` registers on Home mount → `fcmTokens/{deviceId}`; `app/public/firebase-messaging-sw.js` FCM worker at its own scope, coexists w/ PWA worker; **VAPID key set in `app/src/firebase.ts`**; `db` exported). PENDING in step 5: **composer UI** (Admin › Compose §7), **message display** (Home latest + Previous Messages §3, reads `announcements`), **open tracking** (`appOpens` write on Home + admin tracking §8).
**Loose ends:** **Montserrat Medium (500)** not yet added (only Regular self-hosted — add a weight-500 `@font-face` when a screen needs it); no **danger/error color** token yet (wrong-PIN error reuses accent gold). Font sources (TTF) kept in `app/fonts-src/`, out of the deploy.

**Firebase gotchas (learned the hard way — needed for any fresh deploy):**
- **Custom tokens need an IAM grant.** 2nd-gen functions run as the default *compute* SA (`799572583465-compute@developer.gserviceaccount.com`), which lacks token-signing rights. `createCustomToken` fails with `iam.serviceAccounts.signBlob denied` until that SA is granted **Service Account Token Creator** (done 2026-07-18, one-time, project IAM console).
- **First-ever function deploy in a fresh project/region** often fails once with an IAM "service account can not be accessed" error while just-enabled APIs propagate — retry after ~90s. If the failed attempt left a half-created function, `functions:delete` then redeploy so the CLI applies the public-invoker binding (callable functions 403 without it).
- **Ad/privacy blockers break web push (and Firestore) in-browser** — Brave Shields, uBlock, etc. block `firestore.googleapis.com` / FCM registration endpoints, surfacing as `net::ERR_BLOCKED_BY_CLIENT` + `messaging/failed-service-worker-registration`. Not an app bug: disable the blocker for the origin (or use a clean profile) to test. Real users behind aggressive blockers simply won't get push — accepted (push is best-effort; `registerForPush` no-ops on failure). Also: notification tokens/permissions are **per-origin**, so pick one of `localhost` **or** `127.0.0.1` and stay on it.
- **New callable functions can deploy "successfully" but still miss the public-invoker (`allUsers`) binding** — calls then get a Google-Frontend **401 Unauthorized HTML page** (not a JSON callable error), because the request is rejected before reaching the code. Seen on `sendNotification`'s clean first create (2026-07-31). Fix: `functions:delete <name> --region … --force` then redeploy — the fresh **create** applies the binding. (Symptom vs. app-level denial: a real `permission-denied` comes back as JSON `{error:{status:…}}`; the invoker problem is raw HTML.)
- **Firebase Authentication must be provisioned before `signInWithCustomToken` works.** Minting a custom token in the Function succeeds regardless, but the *client* redeeming it hits Identity Toolkit, which returns `CONFIGURATION_NOT_FOUND` until Auth is enabled once via Console → Build → Authentication → **Get started** (done 2026-07-27). No sign-in *provider* is needed for custom-token auth — just the one-time provisioning click. Symptom in-app: sign-in fails at the token-redeem step, not the Function call.
**Open questions:**
- Google Calendar sync mechanism — public iCal feed vs. Calendar API with OAuth; needs research before implementation
- Vercel AI SDK was originally chosen for its streaming/React integration; document search no longer streams to the client, so a plain Anthropic/OpenAI SDK call from the Cloud Function may now be simpler — revisit when implementing

**Build order** (backend-out; UI is now built against `DESIGN.md` + `PAGES.md`, each feature goes schema → function → UI before moving on):
1. **Blaze upgrade** — unblocks everything below
2. **Firestore schema + security rules** — person schema settled (see User entity); roster locked to all client reads, admin gated on `isAdmin`
3. **Seed ~14 test people** — one per role, plus extra delegates/coaches across 2 schools in different divisions/letters, so targeting and calendar merging can actually be exercised
4. **PIN entry flow** — auth Cloud Function (validate → custom token → `signInWithCustomToken`), no rate limiting, plus the entry screen  *(DONE — function deployed; client wired: `app/src/firebase.ts` + `auth.ts` + `screens/Registration.tsx`, stub Home, verified end-to-end)*
5. **Notifications** — FCM send function (resolve teams in memory at send time), composer with quiet toggle, open tracking
6. **Calendar** — merge role + team-letter calendars (resolve team via school lookup)
7. **Requests / queues** — `requests` collection + rules, submit + My Requests + My Queue UI, position-recompute trigger, submit/claim/resolve pushes (reuses FCM from step 5)
8. **Document search** — needs LLM keys; most moving parts, so last
- Cross-cutting: iOS install-instruction prompt in onboarding

