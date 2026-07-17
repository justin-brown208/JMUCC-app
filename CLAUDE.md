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
- Auth function must **rate-limit PIN attempts** per device/IP — the PIN is the sole credential, so an unthrottled endpoint is a brute-force oracle
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
- RAG: model selects only from 1–2 static PDFs (no dynamic/live-editable document, no OC-managed Q&A store)
- LLM: Claude (primary), OpenAI (fallback)
- No streaming — the response is a small structured result (ranked citations), not long-form prose, so it's returned as one shot; fallback triggers if the primary model call fails
- PDFs uploaded once by OC before the event via Firebase console — not a UI feature
- At query time: Cloud Function fetches the static PDF content, passes as full context; system prompt instructs model to return only verbatim quoted spans with highlight offsets, ranked by relevance

### Calendar
- Homepage features a Google Calendar-synced event schedule
- Calendars are split by role and by team letter (e.g. "Volunteer" calendar, "Team A" calendar) — team-letter calendars are shared across all divisions (4 total: A/B/C/D), not one per division
- A user sees the calendar(s) matching their role plus, if their `school` is set, that school's team-letter calendar (resolved via the school lookup — applies to Delegates, Coaches, and Team Ambassadors alike)
- Exact calendar source mechanism (public iCal feed vs API) still TBD — see Status & Next Steps

### Notification
- OC composes and sends
- Targeting: any combination of role(s) + division(s) + letter(s). Volunteer roles are targetable individually (e.g. "all Runners") via the role filter, with an "All volunteers" shortcut that ticks the 5 volunteer values.
- **FCM token stores only `{ personId, token, updatedAt }`** — no denormalized role/school/division/teamLetter. At send time the Cloud Function loads people + schools, resolves teams in memory, filters, and collects matching tokens.
- Rationale: a token that cached `division` would go stale the moment OC corrected a school mapping. Resolving at send time means targeting is always correct by construction.
- **Quiet toggle** — suppresses sound/vibration; notification appears in tray and app only
- No acknowledgement or feedback features — notifications are one-way broadcasts
- **Open tracking** — each user's last home-page-open timestamp is recorded; OC sees, per notification, a high-level breakdown by group (e.g. "19/40 volunteers, 22/24 schools have opened the app since this was sent"), with drill-down to a named list per group on request

### Admin Panel
- Section of the main app gated by the person's `isAdmin` flag (not by role)
- Actions: send notifications (with quiet toggle), view open-tracking breakdown per notification

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
- [2026-07-15] PIN auth via Cloud Function + Firebase custom token; roster never client-readable; attempts rate-limited. **Consequence: Cloud Functions gate the first feature, not just document search** — Blaze upgrade moved to the front of the build order.

---

## Repo Structure
- `app/` — React + Vite + PWA frontend (deployed to Vercel); `vite-plugin-pwa` wired in `app/vite.config.ts`, PWA icons in place
- `functions/` — Firebase Cloud Functions (Node.js/TypeScript; deployed via `firebase deploy --only functions`)
- `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `.firebaserc` — Firebase config at root
- Single root `.gitignore` covers both subprojects (no per-directory gitignores)
- Note: `app/` and `functions/` keep separate `package.json`/`tsconfig.json` — different runtimes (browser vs Node), intentional

## Status & Next Steps
**Done:** Scaffold (React+Vite+PWA, Cloud Functions), single root `.gitignore`, PWA icons
**Blocker:** Firebase Blaze upgrade — now gates the *first* feature, since PIN auth needs a Cloud Function to mint custom tokens. Nothing testable ships until this is done.
**Open questions:**
- Google Calendar sync mechanism — public iCal feed vs. Calendar API with OAuth; needs research before implementation
- Vercel AI SDK was originally chosen for its streaming/React integration; document search no longer streams to the client, so a plain Anthropic/OpenAI SDK call from the Cloud Function may now be simpler — revisit when implementing

**Build order** (backend-out; UI stays bare-bones until Figma lands, each feature goes schema → function → UI before moving on):
1. **Blaze upgrade** — unblocks everything below
2. **Firestore schema + security rules** — person schema settled (see User entity); roster locked to all client reads, admin gated on `isAdmin`
3. **Seed ~14 test people** — one per role, plus extra delegates/coaches across 2 schools in different divisions/letters, so targeting and calendar merging can actually be exercised
4. **PIN entry flow** — auth Cloud Function (validate → custom token → `signInWithCustomToken`) with rate limiting, plus the entry screen
5. **Notifications** — FCM send function (resolve teams in memory at send time), composer with quiet toggle, open tracking
6. **Calendar** — merge role + team-letter calendars (resolve team via school lookup)
7. **Document search** — needs LLM keys; most moving parts, so last
- Cross-cutting: iOS install-instruction prompt in onboarding

