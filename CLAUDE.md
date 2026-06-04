# CLAUDE.md - Project Context Bible

> This document maintains context for Claude instances working on this project.

## User Preferences
- Collaborative, iterative process — small steps, not large info dumps
- Ask before deciding — present options and wait for explicit answers
- Don't be sycophantic — push back directly when a concern doesn't hold up
- Verify commands — web search current best practices before writing

---

## Project Overview
PWA for a university case competition. Core features: push notifications, feedback collection, RAG-based chatbot Q&A. Target: 100–500 participants across one week-long event.

---

## Entities

### User
- Roles: delegate, volunteer, coach, organizing committee (OC)
- Coaches are associated with a specific team
- Named roster pre-seeded in Firestore per role (delegates, coaches, volunteers) — entered via Firebase console before event
- Onboarding: user selects their role then their name from the pre-seeded list for that role; delegates and coaches also select their school/team
- Auth: open self-identification for delegates/volunteers/coaches (no code needed — no elevated permissions). OC gated by a single access code protecting the admin panel.
- Responses and acknowledgements are tied to the selected named individual

### Team Assignment
- 24 teams, 6 divisions, 4 teams per division (letters A–D within each division)
- School list pre-seeded in Firestore via Firebase console before the event — not a UI feature
- At ceremony, OC uses admin panel to assign each school a division + letter
- Participants selected their school from a dropdown on registration — exact string match to pre-seeded list guarantees reliable mapping
- Errors corrected directly via Firebase console

### Chatbot
- RAG: model answers only by citing entries from the rulebook or existing Q&A store
- LLM: Vercel AI SDK — Claude (primary), OpenAI (fallback)
- Streaming enabled; fallback triggers on connection failure before stream starts; mid-stream failures shown as errors
- Rulebook: 16-page PDF converted to Markdown once by OC before the event; uploaded directly to Firestore via Firebase console — not a UI feature
- Rulebook stored as a single Markdown string in Firestore; section headers serve as citation anchors
- Q&A entries managed by OC via admin panel throughout the event (question + answer fields); immediately available to chatbot on next query
- At query time: Cloud Function fetches rulebook + all Q&A entries, passes as full context; system prompt instructs model to cite section headers and Q&A entries explicitly

### Notification
- OC composes and sends
- Targeting: any combination of role(s) + division(s) + letter(s)
- Each FCM token stores: `role`, `school`, `division` (1–6), `teamLetter` (A–D)
- `division` and `teamLetter` are null until OC publishes the ceremony mapping
- **Quiet toggle** — suppresses sound/vibration; notification appears in tray and app only
- **Acknowledgement** — optional toggle; target sees "Acknowledge" button in notification and in-app; OC sees count + named list of who has/hasn't acknowledged
- **Feedback** — optional; OC writes one question + options at compose time; single-select; one question per notification max; responses tied to named individuals
- Feedback stored as: `{ personId, notificationId, answer, timestamp }`
- These are independent toggles — any combination is valid

### Admin Panel
- OC-only section of the main app, gated by access code
- Actions: send notifications (with quiet/acknowledgement/feedback options), manage Q&As, view acknowledgement and feedback responses per notification

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
- [2026-06-03] Open self-ID for non-OC roles — nothing elevated to protect
- [2026-06-03] School list hardcoded via Firebase console, not a UI feature — OC handles corrections via console directly
- [2026-06-03] Team letter convention: A–D within each division (not global A–X)
- [2026-06-03] LLM via Vercel AI SDK (not OpenRouter) — better streaming/React integration; Claude primary, OpenAI fallback
- [2026-06-03] No vector DB — rulebook small enough (~30 pages) to pass as full context per query
- [2026-06-03] Named roster pre-seeded via Firebase console — identity tied to specific individuals, not just teams
- [2026-06-03] Feedback is always notification-triggered, never ambient; one question per notification max
- [2026-06-03] Quiet notification toggle added — independent of acknowledgement/feedback toggles

---

## Next Steps (implementation not yet started)
- Scaffold React + Vite project with `vite-plugin-pwa`
- Set up Firebase project (Firestore + FCM), upgrade to Blaze plan
- Define Firestore schema + security rules (lock down OC-only reads/writes)
- Build onboarding flow (role → name → school selection)
- Build admin panel (notification composer, Q&A manager, response views)
- Wire up Cloud Functions (FCM send, LLM streaming with Claude/OpenAI fallback)
- Add iOS install-instruction prompt to onboarding

