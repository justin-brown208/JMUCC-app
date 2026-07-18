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
- Wrong PIN → inline error.
- Repeated failures → eventual lockout warning (rate-limited server-side). 🟡 threshold TBD — proposing 5 attempts, then a cooldown message.

---

## 2. Home
**Purpose:** Landing screen after login. Hub to everything else.

**Shows**
- Profile indicator (corner): "Hello ___" — tappable, **log out only**
- **Schedule widget** (this is the entire calendar presence — no separate calendar page):
  - Current / soonest-upcoming event, shown large
  - Smaller entries for events after it
  - Widget-style, not a traditional month/week calendar view
- **Latest message box** — shows the full content of the single most recent announcement

**Actions**
- [Previous Messages] → §3
- [Competition Rules] → §4
- [Admin] → §7 *(only visible when `isAdmin`)*

**Not shown:** team/division/school info — users already know their own.

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
  - Message from the Organizing Committee
  - Reminder
  - Urgent Message
- **Body Text\*** — text box
- **Recipient Groups\*** — a button per role (the primary "who"):
  - Delegate · Coach · Organizer · Presentation Room Coordinator · Team Ambassador · Tech Volunteer · General Volunteer · Runner
  - **[All Volunteers]** shortcut — selects the 5 volunteer roles at once
- **Options**
  - [Silent]
- **Filters** *(narrow the selected roles; all teams targeted if left blank)*
  - Division: [1] [2] [3] [4] [5] [6]
  - Team Letter: [A] [B] [C] [D]
  - School: [dropdown] — send to one specific school
- [Send]  [Reset] *(smaller)*

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
