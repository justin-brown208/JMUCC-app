# TESTING.md — Live test session script

Run by Justin. **10 testers:** Fabricio, Aaron, Lina, Laetitia, Rachel, Tyson,
Meriem, Tara, Shehroz, Justin. Everyone in one room / on one call, all logged in
at once.

**One PIN each, for the whole session.** Both parts run against the same 10
identities, so nobody logs out, nobody swaps PINs, and there is no reseed
between Part 1 and Part 2.

That single change makes the numbers honest: **the audience on the confirmation
screen is exactly the set of phones in the room.** There are no unmanned
identities padding it. If Justin targets a group and the screen says 6, six
phones buzz — and if five do, that's a finding you can name on the spot instead
of reconciling against a table.

---

## Before the session — Justin, alone, 2 minutes

```bash
cd dev-seed && node seed.mjs
```

Run this **once**. It writes the 10-person cast and clears out the old two-cast
roster — expect it to report roughly **22 people removed** on the first run.
Confirm it prints 10 people and 3 schools, then don't touch it again.

---

## The roster

### Schools

Crossfield exists so "division 1" and "letter A" select *different* people.
Without it a swapped `division`/`teamLetter` field would pass every test below.

| School | Division | Letter | Who's there |
|---|---|---|---|
| Alpha University | 1 | A | Fabricio, Laetitia |
| Beta College | 2 | B | Aaron |
| Crossfield University | 1 | B | Rachel |

### Cast

| PIN | Person | Identity | Role | School (div/letter) |
|---|---|---|---|---|
| 100001 | Justin | Olivia Organizer | Organizer · **isAdmin** · **academic queue** | — |
| 100002 | Fabricio | Ada Delegate | Delegate | Alpha (1/A) |
| 100003 | Aaron | Grace Delegate | Delegate | Beta (2/B) |
| 100004 | Rachel | Casey Coach | Coach | Crossfield (1/B) |
| 100005 | Laetitia | Amir Ambassador | Team Ambassador | Alpha (1/A) |
| 100006 | Meriem | Tia Tech | Tech Volunteer | — |
| 100007 | Tara | Theo Tech | Tech Volunteer | — |
| 100008 | Tyson | Remy Runner | Runner | — |
| 100009 | Lina | Gene General | General Volunteer | — |
| 100010 | Shehroz | Riya Room | Presentation Room Coordinator | — |

### Why these ten

Fitting both parts into 10 seats forced four decisions worth knowing, because
each one is load-bearing somewhere below:

- **Justin carries both flags.** `isAdmin` and `managesAcademicQueue` are
  independent of role, so the one Organizer sends every notification *and* works
  the academic queue. That freed a seat, and it leaves an Organizer available as
  the "Organizer is not a volunteer role" control in T3.
- **Two tech volunteers, not three.** Two is the minimum that tests both an
  atomic claim race and "a worker who didn't claim it can still drop it".
- **One runner.** Runner and tech are the same collection, trigger and panel, so
  runner gets a confirmation pass; one worker can still walk the whole
  claim → drop → re-claim → resolve loop alone.
- **Two delegates, and the coach at Crossfield.** A third delegate would have
  cost a volunteer seat. Targeting **Delegate + Coach** instead of Delegate
  keeps the division-vs-letter split exactly as sharp — Rachel becomes the
  person who appears in both results (T5/T6).

What that buys: **all five volunteer roles on real phones**, so the "All
Volunteers" shortcut fails by naming a role rather than by coming up short on a
count. And every entitlement combination is manned — including two people who
should see no Requests tab at all, and one who works a queue but may submit to
none.

---

## Setup — before the first send

1. Everyone opens the deployed URL and logs in with their PIN above.
2. **iPhone users: Share → Add to Home Screen, then open from the home screen icon.**
   Push does not work in Safari itself. Do this before T1, or misses will look
   like targeting bugs.
3. Everyone allows notifications when prompted, **then opens Home and waits for
   it to load.** Push registration only runs when Home mounts — someone who
   never lands on Home is not registered and will miss everything.
4. Anyone running an ad/privacy blocker (Brave Shields, uBlock) disables it for
   this origin — it blocks FCM registration outright.

Confirm all 10 are in before starting. Anyone who never got the permission
prompt is not testable.

## Convention for every test

- Justin picks any preset title; **put the test number in the body** ("T4") —
  the sends are otherwise indistinguishable.
- Each person reports **both** signals: the push banner, and the message
  appearing in their in-app list. One without the other is a finding, not a pass.
- "Receives" = both signals. Anyone not named must get **neither**.
- **The audience number on the confirmation screen must equal the count of
  people named in "Receives".** It always does in this doc. A mismatch is a
  finding before anyone even taps Send.

---

# Part 1 — Notification targeting

### T1 — Single role
Justin targets: **role Delegate**, no filters.
Audience 2 → **Fabricio, Aaron**. Nobody else.

### T2 — Multiple roles
Justin targets: **roles Delegate + Coach**, no filters.
Audience 3 → **Fabricio, Aaron, Rachel**.
Not Laetitia, Meriem, Tara, Tyson, Lina, Shehroz, Justin.

### T3 — All Volunteers shortcut
Justin targets: **All Volunteers**, no filters.
Audience 6 → **Laetitia, Meriem, Tara, Tyson, Lina, Shehroz**.
Not Fabricio, Aaron, Rachel, **and not Justin**.

All five volunteer roles are on a phone here:

| Role | Who |
|---|---|
| Team Ambassador | Laetitia |
| Tech Volunteer | Meriem, Tara |
| Runner | Tyson |
| General Volunteer | Lina |
| Presentation Room Coordinator | Shehroz |

**If one of the five stays dark, that role is missing from the shortcut's
expansion** — a specific, nameable bug. Justin's phone staying silent is the
other half: Organizer must not be in the set.

### T4 — One volunteer role alone
Justin targets: **role Runner**, no filters.
Audience 1 → **Tyson** only.
Not Meriem, Tara, Lina, Shehroz — the other volunteer roles must not come along.

### T4b — A second volunteer role alone
Justin targets: **role Presentation Room Coordinator**, no filters.
Audience 1 → **Shehroz** only.

T4 alone can't tell "Runner is targetable" from "Runner happens to work". Two
different volunteer roles, each reaching exactly one person, shows the filter is
reading the actual role value.

### T5 — Division filter
Justin targets: **roles Delegate + Coach, division 1**.
Audience 2 → **Fabricio** (Alpha, div 1), **Rachel** (Crossfield, div 1).
Not Aaron — Beta is division 2.

### T6 — Letter filter
Justin targets: **roles Delegate + Coach, letter B**.
Audience 2 → **Aaron** (Beta, letter B), **Rachel** (Crossfield, letter B).
Not Fabricio — Alpha is letter A.

**T5 and T6 must reach different people.** Same roles, different filter,
overlapping only on Rachel. If both land on the same pair, the two fields are
being read interchangeably. Fully observable — every person involved is manned,
and Rachel appearing in both is the point, not a coincidence.

### T7 — School filter, and role∧filter is an intersection
Justin targets: **roles Delegate + Coach, school Alpha University**.
Audience 1 → **Fabricio** only.
Not Aaron (wrong school), not Rachel (wrong school), **and not Laetitia**, who
*is* at Alpha but is a Team Ambassador — the role filter excludes that seat.

### T8 — Ambassador crossover + teamless exclusion
Justin targets: **All Volunteers + letter A**.
Audience 1 → **Laetitia** only.
Not Meriem, Tara, Tyson, Lina or Shehroz — five volunteers with no school, so a
team filter must drop all five.

The most important send here. Laetitia is a volunteer who still has a team, and
that team is resolved through the school lookup, not stored on the person.
Compare straight against T3: same "All Volunteers" selection, one filter added,
six recipients down to one.

### T9 — Empty match is blocked
Justin targets: **role Runner + division 1**.
Expected: **the app refuses to send** — Tyson has no school, so nothing matches.
If this send goes through, that's a finding.

### T10 — Everyone
Justin targets: **all 8 roles**, no filters.
Audience 10 → **all of us**, including Justin's own device.

### T11 — Multi-value filter *(optional, if time)*
Justin targets: **roles Delegate + Coach, divisions 1 and 2**.
Audience 3 → **Fabricio, Aaron, Rachel** — same as T2, reached a different way.

---

# Part 2 — Request queues

**No logout, no PIN change, no reseed.** Everyone stays exactly who they were in
Part 1 and moves to the Requests tab.

Tech and runner are the same backend (one `requests` collection, one trigger,
one `QueuePanel`), so **tech carries the full lifecycle** and runner gets a
short confirmation pass. **Academic is a genuinely different path** — no claim
step, straight `open → resolved` — and gets its own block (Q10–Q12).

### Who does what

| Person | Role | Works | May submit to |
|---|---|---|---|
| Meriem | Tech Volunteer | **tech** | all 3 |
| Tara | Tech Volunteer | **tech** | all 3 |
| Tyson | Runner | **runner** | all 3 |
| Justin | Organizer · `managesAcademicQueue` | **academic** | **none** |
| Laetitia | Team Ambassador | — | all 3 |
| Lina | General Volunteer | — | all 3 |
| Shehroz | Presentation Room Coordinator | — | all 3 |
| Rachel | Coach | — | **academic only** |
| Fabricio | Delegate | — | none — **no Requests tab** |
| Aaron | Delegate | — | none — **no Requests tab** |

Note that Tyson works the **runner** queue but may submit to **tech** — that's
how the tech queue gets depth, and it exercises "a person can be both submitter
and worker".

---

## The steps

### Q0 — Entitlements, before anything is submitted
Everyone opens the Requests tab and reports what they see. Six distinct
outcomes, all manned:

- **Meriem, Tara** — the **tech queue as the main content**, plus all three
  submit buttons under "Need help yourself?".
- **Tyson** — the **runner queue** as main content, plus all three submit
  buttons.
- **Justin** — the **academic queue** ("Rules Questions") as main content, and
  **no submit buttons at all**.
- **Laetitia, Lina, Shehroz** — all three submit buttons, no queue.
- **Rachel** — **only** "Ask a Rules Question".
- **Fabricio, Aaron** — **no Requests tab in the bottom bar at all.**

Justin's line is a real test, not a formality: work-rights and submit-rights are
computed separately, and his is the only seat where they disagree. Fabricio and
Aaron's line is the one that used to need a mid-session logout to check.

### Q1 — Submit, live arrival, push
Laetitia submits a **tech** ticket: room 101, "projector dead". Phone typed for
the first time.
Expected: it appears in Meriem and Tara's queue **without either refreshing**,
and both get a push. Tyson and Justin see nothing.
Laetitia sees it in My Requests at **position 1**.

### Q2 — FIFO order
In this order: Lina submits tech (room 102), then Shehroz submits tech (103),
then Tyson submits tech (104).
Expected: Lina **2**, Shehroz **3**, Tyson **4**, Laetitia still **1**. Meriem
and Tara both see four tickets, oldest first, in the same order as each other.

Tyson is a runner worker submitting to tech — the ticket must land in the tech
queue and must **not** appear in Tyson's own runner queue view.

### Q3 — Phone remembered, room re-asked
Laetitia submits a second tech ticket (room 105).
Expected: the phone field is **pre-filled**; the room field is **blank**.
Laetitia now has two tickets in My Requests, at **1** and **5**.

Queue is now: Laetitia 1 · Lina 2 · Shehroz 3 · Tyson 4 · Laetitia 5.

### Q4 — Atomic claim
Justin counts down. **Meriem and Tara both tap Claim on ticket #1 at the same
time.**
Expected: exactly one wins. The ticket shows Claimed once, by one name, and both
screens show the *same* name. The loser gets an error or simply sees it flip to
claimed — never two winners, never a name mismatch between the two phones.
Laetitia gets a "claimed" push.

### Q5 — Who can see what
Laetitia reports: only their own two tickets and their positions — no other
people's tickets, no one else's phone number.
Meriem and Tara report: they can see the requester's phone number.

### Q6 — Drop by the worker who didn't claim it
Whichever of Meriem/Tara **lost** Q4 taps Drop on that ticket.
Expected: it returns to Open for both tech workers.
**Laetitia gets no push** — release is silent.
**Laetitia's position is still 1** — dropping keeps the ticket active.

### Q7 — Queue isolation
Laetitia submits a **runner** ticket.
Expected: it appears for **Tyson** only, and Tyson gets a push. It does not
appear in the tech queue or the academic queue, and the five tech tickets never
appear in the runner queue.

### Q8 — Resolve and recompute
A tech worker claims ticket #1 and **Resolves** it.
Expected: Laetitia gets a "resolved" push; the ticket leaves both workers'
queues; the rest move up — **Lina 2→1, Shehroz 3→2, Tyson 4→3, Laetitia's second
5→4.**

Positions must only ever drop. Anyone whose number goes *up* is a finding.

### Q9 — Requester cancels
Lina cancels their own ticket from My Requests.
Expected: gone from Lina's strip and from the workers' queue, no push to
workers, and the rest move up again — **Shehroz 2→1, Tyson 3→2, Laetitia's
second 4→3.**

---

### Q10 — Academic: the coach's only option
Rachel submits the one thing available, an **academic** ticket (room blank is
fine).
Expected: it appears in **Justin's** queue and **nowhere else** — not tech, not
runner. Justin gets a push; Meriem, Tara and Tyson get nothing. Rachel sees it
in My Requests at **position 1**. There is no tech or runner option anywhere in
Rachel's UI.

### Q11 — Academic has no claim step
Justin looks at that ticket.
Expected: **no Claim button, no Drop button, no status pill** — the academic
queue is worked by one person, so tickets go straight `open → resolved`.
Justin taps **Resolve** on a ticket that was never claimed.
Expected: it resolves cleanly, and **Rachel gets a "resolved" push**.

This path is separate rule-branch and trigger code from tech/runner. A Claim
button appearing here, or Resolve failing on an unclaimed ticket, is the finding.

### Q12 — Academic FIFO and out-of-order resolve
Laetitia submits academic, then Shehroz submits academic (volunteers may submit
to any queue, not just coaches).
Expected: Justin sees both, oldest first; Laetitia **1**, Shehroz **2**.
Justin now resolves **Shehroz's** ticket — the second one — out of order.
Expected: Shehroz's disappears and Shehroz gets a push; **Laetitia stays at 1**
and does not move.

Workers are allowed to work out of order; a requester's position must never go
up as a result.

---

### Q13 — Runner lifecycle
Using Laetitia's runner ticket from Q7, Tyson does the whole loop alone:
**claim → drop → re-claim → resolve.**
Expected: identical behaviour to tech. Laetitia gets a push on claim and on
resolve, and **silence on the drop**. Position stays 1 throughout.

### Q14 — Worker submits to their own queue *(optional)*
Meriem submits a **tech** ticket.
Expected: it lands in the tech queue like any other and Meriem sees it there.
Note whether Meriem also gets the worker push for their own ticket — either
behaviour is defensible, we just want to know which.

---

## Not covered

Accepted gaps, and what a single 10-person cast cost:

- **Only one Coach and two Delegates.** Traded for the fifth volunteer role.
  Coach and Delegate exclusions still get exercised (T7 excludes both a
  wrong-school Delegate and a wrong-school Coach), just with one person each
  rather than two.
- **The atomic-claim race is two-way, not three-way.** Two workers is the
  documented minimum and covers both the race and the drop-by-a-non-claimer
  case; a third would only widen the race window.
- **Runner contention is untested.** One runner, so "two runners fight over a
  ticket" never happens. Runner shares its collection, trigger, rules branch and
  panel with tech, where contention *is* tested (Q4).
- **The cross-queue security rule is untestable from a phone.** A worker is only
  ever shown their own queue, so the UI never offers Tyson a tech ticket to
  claim. Q7 proves *visibility* isolation, not the rule. To exercise it, hit
  Firestore with a script signed in as Tyson and attempt a write to a tech
  ticket — expect `permission-denied`.
- **Features this session doesn't touch at all:** the quiet/silent toggle,
  scheduled sends (Compose "Schedule for later" + the Scheduled tab + cancel),
  Message Tracking open-counts, the calendar widget and View Full Week, and
  document search. Say the word if any of these should become a Part 3.
