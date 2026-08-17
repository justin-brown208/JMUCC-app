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
- **Calendar source (resolved 2026-08-03):** OC keeps ~9 **public** Google Calendars — **Global** (everyone) + role-groups **Delegates / Coaches / Organizers / Volunteers** (one shared Volunteers cal for all 5 volunteer roles) + **Team A/B/C/D**. Each person pulls Global + their role-group + (if they have a team) their team-letter cal; a Team Ambassador naturally gets Global+Volunteers+Team X. Read via **Calendar API v3 `events.list` + an API key** (no OAuth — calendars are public), fetched **client-side** (googleapis.com is CORS-enabled) and cached in localStorage. Config in `app/src/calendarConfig.ts` (API key + 9 calendar IDs + full-week image URL — all placeholders until filled); resolution/fetch in `app/src/schedule.ts`

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
- LLM: **OpenRouter** (OpenAI-compatible SDK, one `OPENROUTER_API_KEY` secret; model = swappable slug) — see decision log 2026-08-17
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
- [2026-06-03] LLM via Vercel AI SDK (not OpenRouter) — better streaming/React integration; Claude primary, OpenAI fallback — **REVERSED 2026-08-17, see below**
- [2026-08-17] **LLM via OpenRouter (reverses the 2026-06-03 Vercel-AI-SDK pick).** The original reason (streaming/React integration) is void — document search doesn't stream and runs server-side in a Cloud Function, not React. OpenRouter gives one OpenAI-compatible SDK + one key (`OPENROUTER_API_KEY`) with models as **swappable slug strings** (`anthropic/claude-sonnet-5` primary, `openai/gpt-5` fallback — change in `search.ts`, no code edit). We do **not** use Anthropic's native-citations feature (OpenRouter can't expose it) — instead the model returns candidate quotes as JSON and the function **substring-verifies each against the source text** (whitespace/case-insensitive), dropping any non-verbatim span. That guard keeps "verbatim only" structurally while leaving the prompt fully tunable. Trade-off: a middleman + small token markup, negligible for a one-week on-demand feature. Explicit primary→fallback try/catch (not OpenRouter's `models` array) for legible behavior.
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
- [2026-07-17] Notification title is a required pick from a fixed preset set, not free text; recipients chosen as roles-then-narrowing-filters; Send shows a plain-language confirmation of the audience
- [2026-07-31] Title presets shortened to **Message / Announcement / Reminder** — the platform appends "…from JMUCC" (PWA `short_name`) to every push automatically, so long titles like "Message from the Organizing Committee" read redundantly ("…Committee from JMUCC"). Presets are effectively prefixes to an OS-supplied "from JMUCC"
- [2026-07-17] FAQ reintroduced as a second *static* PDF (not the old OC-managed live Q&A store) — document search now cites rulebook + FAQ; both also openable full-screen in an off-the-shelf PDF viewer
- [2026-07-17] Calendar is a home-screen widget (next/current event prominent, later events smaller), not a full calendar view; PIN login persists permanently until logout
- [2026-07-27] Added a **generalized request/queue** feature (new `requests` collection) — 3 hardcoded queues (academic/tech/runner); workers by role (Tech Volunteer, Runner) or by a `managesAcademicQueue` flag (VP Academics, not a role); coaches submit to academic only, volunteers to any; "call me" tickets with locally-saved phone; live FIFO position computed server-side and pushed (requester can't read others' PII); claim is atomic; pushes on submit/claim/resolve
- [2026-07-31] Queue workers can **release ("drop") a claimed ticket** back to the queue (`claimed → open`, clears claimedBy/claimedAt) — any queue worker can free an abandoned claim; **silent** (no requester push), position unchanged. Distinct from the earlier-rejected "bounce"/reassign: it returns to the open pool, not to a named worker
- [2026-08-03] **Calendar (step 6) mechanism chosen:** ~9 **public** Google Calendars (Global + Delegates/Coaches/Organizers/Volunteers + Team A–D), read via **Calendar API v3 + API key, client-side** (public data → no OAuth/service account; googleapis.com is CORS-enabled), merged + localStorage-cached (stale-while-revalidate). Chose this over an iCal feed (JSON is cleaner to parse/filter) and over OAuth/service-account (unnecessary for public calendars). "View Full Week" uses an off-the-shelf zoom/pan viewer (`react-zoom-pan-pinch`) on an OC-supplied static image
- [2026-08-03] Added **scheduled notifications** — Compose gets a "Send now / Schedule for later" toggle + time picker; a third Admin tab **Scheduled** lists/cancels pending sends. New `scheduledNotifications` collection (stores compose *criteria* + `sendAt`, never resolved recipients). A `runScheduledSends` `onSchedule` poller (every 1 min) fires due ones through the **same** `performSend` path (extracted from `sendNotification`), so targeting resolves at fire time. `scheduleNotification` / `cancelScheduledNotification` callables (admin-gated). Chose the poller over Cloud Tasks: simpler, and idle cost is ~$0 (free tiers cover the every-minute run; function scales to zero between runs)
- [2026-07-31] Added a **"View Full Week"** button by the schedule widget — opens a static full-week schedule **image** (OC-supplied, uploaded before the event) in an **off-the-shelf zoomable/pannable image viewer** (not custom-built, not generated from the calendar feed); new `PAGES.md` §11

---

## Repo Structure
- `app/` — React + Vite + PWA frontend (deployed to Vercel); `vite-plugin-pwa` wired in `app/vite.config.ts`, PWA icons in place
- `functions/` — Firebase Cloud Functions (Node.js/TypeScript; deployed via `firebase deploy --only functions`)
- `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `.firebaserc` — Firebase config at root
- `PAGES.md` — per-page UI spec (11 screens: Registration, Home, Previous Messages, Rules Search, Rules Results, PDF Viewer, Admin › Compose, Admin › Tracking, Submit a Request, My Queue, Full Week Schedule); the build-against reference for frontend work
- `OVERVIEW.md` — plain-language, non-developer tour of the app (what each screen does, what users can do/learn, per-role breakdown); no backend detail. Keep user-facing behavior in sync with `PAGES.md`
- `DESIGN.md` — the design language: semantic color tokens, 2 type roles (Montserrat body + TradeGothic CondEighteen Bold display), 9px-radius surface primitive whose outline color encodes state, navy→black gradient. Consult before building any UI. (Display font is licensed — needs a webfont or condensed-bold fallback.)
- **`SCHEMA.md` — the source of truth for the Firestore data model (7 collections: `people`, `schools`, `announcements`, `fcmTokens`, `appOpens`, `requests`, `scheduledNotifications`) and their client access rules. ALWAYS consult it before touching Firestore, `firestore.rules`, or any Cloud Function, and update it in the SAME commit as any data-model change so it never drifts from `firestore.rules`.**
- Single root `.gitignore` covers both subprojects (no per-directory gitignores)
- Note: `app/` and `functions/` keep separate `package.json`/`tsconfig.json` — different runtimes (browser vs Node), intentional

## Status & Next Steps
**Done:** Scaffold (React+Vite+PWA, Cloud Functions), single root `.gitignore`, PWA icons, Blaze upgrade, DB created (Standard edition, `northamerica-northeast1`/Montreal), `firestore.rules` written+audited+**deployed live**, `SCHEMA.md` = data-model source of truth, `dev-seed/` seeding tooling built + **seed run** (test PINs 100001–100014), **PIN auth function `authenticateWithPin` built + deployed + verified live** (mints custom token, resolves team via school lookup, returns profile; no rate-limiting), **Firebase Auth enabled** (Console Get-started — custom-token redeem now works), **web app registered** (config in `app/src/firebase.ts` — public identifiers), **display font self-hosted** (`app/public/fonts/*.woff2`, `--font-display` token; TTF source in `app/fonts-src/`, out of the deploy), **PIN entry client built + verified end-to-end** (Registration → Home stub, DESIGN tokens in `index.css`)
**Step 5 (FCM notifications) — DONE (pending final UI eyeball).** (a) **send function `sendNotification` built + deployed + targeting verified live** (`functions/src/notifications.ts` + shared `constants.ts`; admin-gated on `isAdmin`; roles + division/letter/school filters with in-memory team resolution; teamless correctly excluded by team filters; empty-match blocked; writes `announcement` w/ `recipientIds`; FCM multicast in 500-batches + stale-token prune; quiet toggle via `webpush.notification.silent`). (b) **Client push registration built + verified end-to-end — real banner delivered** (`app/src/fcm.ts` registers on Home mount → `fcmTokens/{deviceId}`; `app/public/firebase-messaging-sw.js` FCM worker at its own scope, coexists w/ PWA worker; **VAPID key set in `app/src/firebase.ts`**; `db` exported). (c) **composer UI built** (`app/src/screens/admin/Compose.tsx` — preset title, body, role chips + All Volunteers, silent, division/letter/school filters, plain-language confirm; DESIGN language refined: muted→white selection, filled-gold primary button). (d) **message display built** (`app/src/messages.ts` + `MessageCard`; Home latest + Previous Messages §3; composite index deployed). (e) **open tracking built** (`app/src/appOpens.ts` stamps `appOpens/{uid}` on Home; `getMessageTracking` function computes opened-since-sent grouped by role **and** team w/ named drill-down; `app/src/screens/admin/Tracking.tsx` + `AdminNav` tabs). **Step 5 COMPLETE** pending final UI eyeball.
**Post-step-5 additions (done):** **scheduled notifications** (see decision log 2026-08-03 — `scheduledNotifications` collection, `scheduleNotification`/`cancelScheduledNotification` callables, `runScheduledSends` minute-poller, Compose "Schedule later" toggle + Scheduled tab; all deployed + E2E-verified). **Message caching** (`firebase.ts` persistent IndexedDB cache w/ multi-tab manager; `messages.ts` switched to `onSnapshot` live subscription → instant paint from cache + live updates).
**Step 6 (Calendar) — DONE + verified live.** Client-side Google Calendar: `app/src/calendarConfig.ts` (**API key + all 9 calendar IDs filled**), `app/src/schedule.ts` (per-profile calendar resolution + Calendar API fetch/merge + HTML-stripped event `description` + localStorage cache), `ScheduleWidget` on Home (featured event large w/ description subtext → later smaller → View Full Week), `app/src/screens/FullWeek.tsx` (`react-zoom-pan-pinch` viewer). Verified against the real calendars: **8/9 return 200**. **Outstanding:** the **`volunteers` calendar 404s** — OC must make it public (or the ID is wrong); a 404 calendar is caught+skipped so nothing breaks. Also: `FULL_WEEK_IMAGE_URL` still a placeholder image, and the API key should get an **HTTP-referrer restriction** (localhost + Vercel domain) now that it's confirmed working.
**Step 7 (Requests/queues) — built + backend verified, pending in-browser eyeball.** `requests` rules **written + deployed** (create/read/cancel/claim/release/resolve, each `get()`-gated on the caller's role/`managesAcademicQueue`); `onRequestWrite` trigger deployed + **position E2E-verified** (FIFO assign → recompute on resolve → null-on-close; loop-guarded by "no status change → return"; pushes on submit→workers / claim+resolve→requester via `push.ts`, release+cancel silent); composite indexes deployed; **VP Academics seeded** (PIN **100015**, `managesAcademicQueue`, role Organizer, added to `dev-seed/seed-data.mjs` + live). Client: `app/src/requests.ts` (submit/cancel/claim/resolve/drop + `onSnapshot` subscriptions + `submittableQueues`/`workedQueue` helpers), `screens/SubmitRequest.tsx` + `screens/MyQueue.tsx` + `components/MyRequests.tsx`, Home requests zone (submit buttons + My Requests strip + My Queue button). **First Eventarc (Firestore-trigger) deploy needs a ~2–3 min propagation wait then redeploy** — noted below.
**Step 8 (Document search) — DONE + verified live.** `functions/src/search.ts` = `searchDocuments` callable (any signed-in user): downloads the static PDFs from Storage (`documents/rulebook.pdf`, `documents/faq.pdf`), extracts text with **`unpdf`** (warm-instance cache), sends text + question to **OpenRouter** (primary `anthropic/claude-sonnet-5` → fallback `openai/gpt-5`, explicit try/catch) with a tunable JSON-contract system prompt (the `SYSTEM_PROMPT` const — the tuning point), then **substring-verifies each returned quote against the source** (whitespace/case-insensitive) and drops non-verbatim ones → ranked `{doc, docLabel, label, quote, rank}` (≤4). **Tolerates a missing doc** (loads whichever exist; only errors `failed-precondition` if none) — so it runs on the rulebook alone while the FAQ isn't uploaded. Storage wired: `storage.rules` (`documents/**` public read, no client write; rest denied) + `firebase.json` `storage` block; `tsconfig` got `skipLibCheck` (unpdf's types pull an optional `@napi-rs/canvas` we don't use). Client: `app/src/search.ts` (callable) + `searchConfig.ts` (`DOC_PATHS`/`DOC_LABELS`) + `screens/RulesSearch.tsx` (§4+§5, ranked citation cards) + `screens/PdfViewer.tsx` (§6, browser `<iframe>` on a runtime-resolved `getDownloadURL` — no hardcoded token, missing-doc-safe) + Home "Competition Rules" button + App router (`rules`/`pdf` views). **Deployed + E2E-verified live** (real ranked verbatim citations for a rulebook query; clean `[]` for a no-match query; ~3–7s). **Outstanding:** OC to upload `faq.pdf` (search + viewer already handle its absence); `OPENROUTER_API_KEY` secret set (v1 enabled); Storage enabled + rulebook uploaded. Verified via a throwaway PIN→callable Node script (deleted).
**Loose ends:** **Montserrat Medium (500)** not yet added (only Regular self-hosted — add a weight-500 `@font-face` when a screen needs it); no **danger/error color** token yet (wrong-PIN error reuses accent gold). Font sources (TTF) kept in `app/fonts-src/`, out of the deploy.

**Firebase gotchas (learned the hard way — needed for any fresh deploy):**
- **Custom tokens need an IAM grant.** 2nd-gen functions run as the default *compute* SA (`799572583465-compute@developer.gserviceaccount.com`), which lacks token-signing rights. `createCustomToken` fails with `iam.serviceAccounts.signBlob denied` until that SA is granted **Service Account Token Creator** (done 2026-07-18, one-time, project IAM console).
- **First-ever function deploy in a fresh project/region** often fails once with an IAM "service account can not be accessed" error while just-enabled APIs propagate — retry after ~90s. If the failed attempt left a half-created function, `functions:delete` then redeploy so the CLI applies the public-invoker binding (callable functions 403 without it).
- **Ad/privacy blockers break web push (and Firestore) in-browser** — Brave Shields, uBlock, etc. block `firestore.googleapis.com` / FCM registration endpoints, surfacing as `net::ERR_BLOCKED_BY_CLIENT` + `messaging/failed-service-worker-registration`. Not an app bug: disable the blocker for the origin (or use a clean profile) to test. Real users behind aggressive blockers simply won't get push — accepted (push is best-effort; `registerForPush` no-ops on failure). Also: notification tokens/permissions are **per-origin**, so pick one of `localhost` **or** `127.0.0.1` and stay on it.
- **First Firestore-trigger deploy fails once on Eventarc** — the initial `onDocumentWritten`/etc. deploy 400s with "Permission denied while using the Eventarc Service Agent … may take a few minutes before permissions are propagated" (the service agent was just created). Not an error in the code: **wait ~2–3 min and redeploy** and it succeeds (seen on `onRequestWrite` 2026-08-03). Subsequent updates deploy immediately.
- **New callable functions can deploy "successfully" but still miss the public-invoker (`allUsers`) binding** — calls then get a Google-Frontend **401 Unauthorized HTML page** (not a JSON callable error), because the request is rejected before reaching the code. Seen on `sendNotification` (2026-07-31) and `getMessageTracking` (2026-08-03). Fix: `functions:delete <name> --region … --force` then redeploy — the fresh **create** applies the binding. **Then WAIT ~1–2 min: the IAM binding takes time to propagate; testing immediately still returns 401 even though the fix worked.** (Symptom vs. app-level denial: a real `permission-denied` comes back as JSON `{error:{status:…}}`; the invoker problem is raw HTML.)
- **Firebase Authentication must be provisioned before `signInWithCustomToken` works.** Minting a custom token in the Function succeeds regardless, but the *client* redeeming it hits Identity Toolkit, which returns `CONFIGURATION_NOT_FOUND` until Auth is enabled once via Console → Build → Authentication → **Get started** (done 2026-07-27). No sign-in *provider* is needed for custom-token auth — just the one-time provisioning click. Symptom in-app: sign-in fails at the token-redeem step, not the Function call.
**Working patterns (proven here — reuse them):**
- **Wait for real time before testing a deploy.** IAM/Eventarc/index propagation is measured in minutes; an immediate re-test reports a false failure and sends you debugging a non-bug. Use an actual backgrounded `sleep` (60–180s), never an instant retry loop.
- **Cache client reads by default.** Firestore `persistentLocalCache` + `onSnapshot` gives instant paint + live updates + offline for free; hand-rolled caches aren't needed. Non-Firestore reads (Google Calendar) use the same shape via localStorage stale-while-revalidate.
- **Defer *criteria*, never resolved recipients.** Scheduled sends store the compose filters and re-resolve at fire time through the *same* send path — so a school/division correction can't strand a queued message with stale targeting. Same reason tokens carry no denormalized team fields.
- **One shared core, thin callers.** `performSend` (send + scheduler) and `assertAdmin` (send + tracking) were extracted the moment a second caller appeared — keeps behavior identical by construction instead of by discipline.
- **Server-computed, pushed-down values where rules block a client read.** Queue `position` is written onto each ticket by a trigger because a requester can't read others' tickets to derive it — the same pattern will fit any future "your standing among others" number.
- **Verify backend through the real endpoint before building UI on it** (curl the callable / Admin-SDK the trigger). Every feature this session caught its bug at that stage, not in the browser.

**Open questions:**
- *(resolved 2026-08-17)* LLM SDK choice → **OpenRouter** (see decision log). No open questions currently.

**Build order** (backend-out; UI is now built against `DESIGN.md` + `PAGES.md`, each feature goes schema → function → UI before moving on):
1. **Blaze upgrade** — unblocks everything below
2. **Firestore schema + security rules** — person schema settled (see User entity); roster locked to all client reads, admin gated on `isAdmin`
3. **Seed ~14 test people** — one per role, plus extra delegates/coaches across 2 schools in different divisions/letters, so targeting and calendar merging can actually be exercised
4. **PIN entry flow** — auth Cloud Function (validate → custom token → `signInWithCustomToken`), no rate limiting, plus the entry screen  *(DONE — function deployed; client wired: `app/src/firebase.ts` + `auth.ts` + `screens/Registration.tsx`, stub Home, verified end-to-end)*
5. **Notifications** — FCM send function (resolve teams in memory at send time), composer with quiet toggle, open tracking
6. **Calendar** — merge role + team-letter calendars (resolve team via school lookup)
7. **Requests / queues** — `requests` collection + rules, submit + My Requests + My Queue UI, position-recompute trigger, submit/claim/resolve pushes (reuses FCM from step 5)  *(DONE — rules+trigger deployed + position E2E-verified; UI built; pending in-browser eyeball)*
8. **Document search** — OpenRouter + verbatim substring-verify; Storage PDFs  *(DONE — `search.ts` + Storage config + §4–6 client UI; deployed + E2E-verified live)*
- Cross-cutting: iOS install-instruction prompt in onboarding

