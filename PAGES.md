# JMUCC App — Page Specs

> Working spec for each screen. Markers: ✅ settled · 🟡 needs detail · ❓ open (see chat)

**App-wide**
- PIN login is remembered permanently — Registration only appears until a valid PIN is entered once, then never again unless logged out.
- iOS install instructions are handled *outside* the app — not a screen.

---

## 1. Registration
**Purpose:** The app's only entry point. A 6-digit PIN identifies the person; no name/role selection.

**Shows**
- Title: "Registration PIN"
- 6-digit PIN entry
- Help text: where to find your PIN
- [Submit]

**Behavior**
- Wrong PIN → inline error. No lockout / cooldown (rate-limiting deliberately skipped — see CLAUDE.md 2026-07-18).

---

## 2. Home
**Purpose:** Landing screen after login. Hub to everything else.

**Shows**
- Profile indicator (corner): "Hello ___" — tappable, **log out only**
- **Schedule widget** (this is the entire calendar presence — no separate calendar page):
  - Current / soonest-upcoming event, shown large
  - Smaller entries for events after it
  - Widget-style, not a traditional month/week calendar view
  - **[View Full Week]** → §11 — opens the whole-week schedule as a zoomable image
- **Latest message box** — shows the full content of the single most recent announcement
- **Requests zone** *(only for eligible submitters — coaches + volunteer roles)*:
  - One button **per queue the user may submit to**, labeled by intent:
    - [Ask a Rules Question] → §9 *(academic — coaches + volunteers)*
    - [Request a Runner] → §9 *(runner — volunteers only)*
    - [Report a Tech Issue] → §9 *(tech — volunteers only)*
  - **My Requests** strip below the buttons — the user's active tickets, each showing status + **live position** ("You're #3 in line") and a [Cancel] control. Empty when they have none.

**Actions**
- [Previous Messages] → §3
- [Competition Rules] → §4
- [My Queue] → §10 *(only visible to queue workers — Tech Volunteers, Runners, and the VP with `managesAcademicQueue`)*
- [Admin] → §7 *(only visible when `isAdmin`)*

**Not shown:** team/division/school info — users already know their own.

**Note:** a person can be both a requester and a queue worker; Home shows whichever affordances apply to them.

---

## 3. Previous Messages
**Purpose:** History of every announcement this user has received.

**Shows**
- A single scrollable page listing all past messages, newest first
- Each message shown in **full inline** — no tap-to-expand (notifications are always short)

---

## 4. Competition Rules — Search
**Purpose:** Ask a natural-language question, get cited passages back.

**Shows**
- Title: "Competition Rules"
- Prompt: "Ask something!"
- Natural-language question box (blank until they ask — no examples/history)
- [Submit]
- — page break —
- [Full Rulebook] → §6 (rulebook PDF)
- [Full FAQ] → §6 (FAQ PDF)

---

## 5. Competition Rules — Results
**Purpose:** Ranked citations for the submitted question.

**Shows**
- 1–4 ranked citation blocks, each:
  - Source label, e.g. "Rulebook Section 5.1.1: Materials Allowed"
  - Quoted passage, read-only (no tap-to-jump)
- If nothing matches: "No relevant passages found"
- [Full Rulebook] → §6
- [Full FAQ] → §6

---

## 6. Full Document Viewer
**Purpose:** Read a source PDF in full (rulebook or FAQ).

**Shows**
- A basic PDF viewer — third-party/off-the-shelf, not custom-built.

---

## Admin Area *(only reachable when `isAdmin`)*
Entered via [Admin] on Home. The area has its own internal navigation between the sub-pages below.

### 7. Compose Notification
**Purpose:** OC composes and sends a targeted announcement.

**Shows**
- Title: "Compose a Notification"
- **Title\*** — required, pick one of a predefined set (no custom text):
  - Message
  - Announcement
  - Reminder
  - *(iOS/Android append "…from JMUCC" automatically, so titles stay short)*
- **Body Text\*** — text box
- **Recipient Groups\*** — a button per role (the primary "who"):
  - Delegate · Coach · Organizer · Presentation Room Coordinator · Team Ambassador · Tech Volunteer · General Volunteer · Runner
  - **[All Volunteers]** shortcut — selects the 5 volunteer roles at once
- **Options**
  - [Silent]

- [Send]  [Reset] *(smaller)*

- **Filters** *(narrow the selected roles; all teams targeted if left blank)*
  - Division: [1] [2] [3] [4] [5] [6]
  - Team Letter: [A] [B] [C] [D]
  - School: [dropdown] — send to one specific school


**Behavior**
- Recipient model = **role buttons, then narrowed by filters** (division / letter / school).
- [Reset] clears the whole form.
- [Send] → confirmation dialog with plain-language subtext describing exactly who will receive it (e.g. "This goes to all Coaches in Division 3, Team A").

### 8. Message Tracking
**Purpose:** Per-notification breakdown of who has opened the app since it was sent.

**Shows**
- List of sent notifications; select one to see:
  - High-level proportions by group (e.g. "19/40 volunteers, 22/24 schools")
  - Drill-down to named lists per group

---

## Requests (help-desk queues)
A generalized queue feature: eligible users submit "call me" tickets; queue
workers claim and resolve them. Entered from Home. See `SCHEMA.md` → `requests`.

### 9. Submit a Request
**Purpose:** Raise a ticket in one queue. Which queue is fixed by the button tapped on Home (§2), never chosen here.

**Shows**
- Title reflecting the queue (e.g. "Ask a Rules Question")
- **Description** — optional short text box ("Anything we should know? (optional)")
- **Room #** — single-line, prompted every time, may be left blank
- **Phone** — pre-filled from the last value saved on this device; editable; saved locally on submit so it's typed once
- [Submit]

**Behavior**
- Name is taken from the profile automatically — not entered.
- On submit → ticket enters the queue at the back; user returns to Home where the **My Requests** strip now shows this ticket with its live position.
- The queue's worker(s) get a push.

### 10. My Queue
**Purpose:** A queue worker sees and works their queue. *(Reachable only by Tech Volunteers, Runners, and the VP with `managesAcademicQueue`; each sees only the queue they work.)*

**Shows**
- Title: the queue name
- **FIFO list of active tickets**, oldest first, each showing: requester name, room # (or "no room"), description (or "Call me"), phone, submitted-time, and status.
- Per ticket: [Claim] (when open) → then [Resolve] or [Drop]. A claimed ticket shows who claimed it.

**Behavior**
- **Claim** is atomic — once one worker claims a ticket it can't be claimed by another; claiming pushes the requester ("someone's on it").
- **Resolve** closes the ticket and pushes the requester.
- **Drop** releases a claimed ticket back to the queue (un-claims it) — it returns to the waiting list for anyone to take. **No notification** to the requester, and they keep their position. Any queue worker can drop a claimed ticket, so an abandoned claim can be freed.
- Workers may claim/resolve **out of order** — position for waiting requesters still reflects creation order among what's active.
- Resolved/canceled tickets drop off the list.

---

## 11. Full Week Schedule
**Purpose:** The whole-week schedule at a glance — the wide view the Home widget deliberately isn't. Reached via [View Full Week] on Home (§2).

**Shows**
- A single **static schedule image** (poster/grid the OC supplies before the event), shown in a **zoomable / pannable image viewer**.

**Behavior**
- Uses an **off-the-shelf image viewer** (pinch/scroll to zoom, drag to pan) — not custom-built, not generated from the calendar feed.
- Read-only. No per-user personalization — it's the same full-week image for everyone.
