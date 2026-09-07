# TESTING.md — Live test session scripts

Run by Justin. **7 testers:** Fabricio, Aaron, Lina, Laetitia, Rachel, Tyson,
Justin. Everyone in one room / on one call, all logged in at once.

The two parts need **different app roles for the same 7 people**, so each has its
own cast and PIN block. **Both casts are seeded and live** (`node seed.mjs all`),
so moving from Part 1 to Part 2 is just logging out and back in with the other
PIN — no reseed mid-session.

The cost of that: **every identity nobody is logged in as still counts toward a
send's audience.** With 22 seeded people and 7 testers, the number on the
confirmation screen is always larger than the number of phones that light up.
Both figures are listed per send below, and the *receiving* lists are unaffected
— unmanned identities have no device.

---

# Part 1 — Notification targeting

Roster is **already seeded and live** (all 22 identities). To re-run:
`cd dev-seed && node seed.mjs all`.

## Schools

Crossfield exists so "division 1" and "letter A" select *different* people.
Without it a swapped `division`/`teamLetter` field would pass every test below.

| School | Division | Letter |
|---|---|---|
| Alpha University | 1 | A |
| Beta College | 2 | B |
| Crossfield University | 1 | B |

## Cast

| PIN | Person | Identity | Role | School (div/letter) |
|---|---|---|---|---|
| 100001 | Fabricio | Ada Delegate | Delegate | Alpha (1/A) |
| 100002 | Aaron | Grace Delegate | Delegate | Beta (2/B) |
| 100003 | Lina | Cleo Delegate | Delegate | Crossfield (1/B) |
| 100004 | Rachel | Coach Alpha | Coach | Alpha (1/A) |
| 100006 | Laetitia | Amir Ambassador | Team Ambassador | Alpha (1/A) |
| 100008 | Tyson | Remy Runner | Runner | — |
| 100010 | Justin | Olivia Organizer | Organizer · **isAdmin** | — |
| 100005 | *(unmanned)* | Coach Beta | Coach | Beta (2/B) |
| 100007 | *(unmanned)* | Tia Tech | Tech Volunteer | — |
| 100009 | *(unmanned)* | Gene General | General Volunteer | — |
| 100011 | *(unmanned)* | Riya Room | Presentation Room Coordinator | — |

Three delegates across three different schools is the part that must not be cut
— it's what makes the division-vs-letter pair (T5/T6) meaningful. Laetitia is
the other load-bearing seat: a *volunteer* who still carries a team. Tyson is
the teamless control.

## Setup — before the first send

1. Everyone opens the deployed URL and logs in with their PIN above.
2. **iPhone users: Share → Add to Home Screen, then open from the home screen icon.**
   Push does not work in Safari itself. Do this before T1, or misses will look
   like targeting bugs.
3. Everyone allows notifications when prompted, then opens Home once.
4. Anyone running an ad/privacy blocker (Brave Shields, uBlock) disables it for
   this origin — it blocks FCM registration outright.

Confirm all 7 are in before starting. Anyone who never got the permission prompt
is not testable.

## Convention for every test

- Justin picks any preset title; **put the test number in the body** ("T4") —
  the sends are otherwise indistinguishable.
- Each person reports **both** signals: the push banner, and the message
  appearing in their in-app list. One without the other is a finding, not a pass.
- "Receives" = both signals. Anyone not named must get **neither**.
- **Audience** = what the confirmation screen says, counting all 22 seeded
  identities including the entire Part 2 cast. **Receives** = who actually holds
  a phone. They differ on every send; both are listed below.

---

## The sends

### T1 — Single role
Justin targets: **role Delegate**, no filters.
Audience 4. Receives: **Fabricio, Aaron, Lina**. Nobody else.
(The 4th is Dana Delegate from the Part 2 cast — unmanned.)

### T2 — Multiple roles
Justin targets: **roles Delegate + Coach**, no filters.
Audience 7. Receives: **Fabricio, Aaron, Lina, Rachel**.
Not Laetitia, Tyson, Justin.

### T3 — All Volunteers shortcut
Justin targets: **All Volunteers**, no filters.
Audience 13. Receives: **Laetitia, Tyson**.
Not Fabricio, Aaron, Lina, Rachel, **and not Justin**.

Two checks at once: Team Ambassador *is* one of the five volunteer roles, and
Organizer is *not*. 13 is every volunteer across both casts; if the shortcut
missed a role the number drops well below it.

### T4 — One volunteer role alone
Justin targets: **role Runner**, no filters.
Audience 3. Receives: **Tyson** only.

Volunteer roles must be targetable individually, not only as a block.

### T5 — Division filter
Justin targets: **role Delegate + division 1**.
Audience 3. Receives: **Fabricio, Lina**. Not Aaron.

### T6 — Letter filter
Justin targets: **role Delegate + letter B**.
Audience 2. Receives: **Aaron, Lina**. Not Fabricio.

**T5 and T6 must reach different people.** Same role, different filter,
overlapping only on Lina. If both land on the same group, the two fields are
being read interchangeably. Fully observable — every person involved is manned.

### T7 — School filter, and role∧filter is an intersection
Justin targets: **roles Delegate + Coach, school Alpha University**.
Audience 3. Receives: **Fabricio, Rachel**.
Not Aaron, Lina — **and not Laetitia**, who is at Alpha but is a Team
Ambassador, so the role filter excludes that seat.

### T8 — Ambassador crossover + teamless exclusion
Justin targets: **All Volunteers + letter A**.
Audience 2. Receives: **Laetitia** only.
Not Tyson — a volunteer with no school, so a team filter must drop that seat.

The most important test here. Laetitia is a volunteer who still has a team, and
that team is resolved through the school lookup, not stored on the person.

### T9 — Empty match is blocked
Justin targets: **role Runner + division 1**.
Expected: **the app refuses to send** — Tyson has no school, so nothing matches.
If this send goes through, that's a finding.

### T10 — Everyone
Justin targets: **all 8 roles**, no filters.
Audience 22. Receives: **all 7 of us**, including Justin's own device.

### T11 — Multi-value filter *(optional, if time)*
Justin targets: **role Delegate + divisions 1 and 2**.
Audience 4. Receives: **Fabricio, Aaron, Lina** — same as T1, reached a
different way.

---

# Part 2 — Runner / Tech queues

**Before starting:** everyone logs out and back in with their `2000xx` PIN.
No reseed — the Part 2 cast is already live.

The idle Part 1 identities do not interfere here: Tia Tech and Remy Runner are
seeded queue workers, so they sit in the worker push audience on every submit,
but neither has a device and neither appears in anyone's queue view.

Runner and tech are the same backend (one `requests` collection, one trigger,
one `QueuePanel`), so **tech carries the full lifecycle** and runner gets a
short confirmation pass.

## Cast

| PIN | Person | Identity | Role | Works | May submit to |
|---|---|---|---|---|---|
| 200001 | Justin | Theo Tech | Tech Volunteer | **tech** | all 3 |
| 200002 | Fabricio | Tess Tech | Tech Volunteer | **tech** | all 3 |
| 200004 | Aaron | Rosa Runner | Runner | **runner** | all 3 |
| 200005 | Lina | Rex Runner | Runner | **runner** | all 3 |
| 200007 | Laetitia | Piper Room | Presentation Room Coordinator | — | all 3 |
| 200008 | Rachel | Ana Ambassador | Team Ambassador · Alpha | — | all 3 |
| 200009 | Tyson | Casey Coach | Coach · Beta | — | **academic only** |
| 200003 | *(unmanned)* | Tobias Tech | Tech Volunteer | tech | — |
| 200006 | *(unmanned)* | Gwen General | General Volunteer | — | — |
| 200010 | *(unmanned)* | Dana Delegate | Delegate | — | — |
| 200011 | *(unmanned)* | Vera VP | Organizer · `managesAcademicQueue` | academic | — |

Two workers per queue is enough: A claims, B drops proves that *any* worker can
free an abandoned claim, and two people can contend for the same ticket at once.
Vera is unmanned so academic tickets sit unworked on purpose (Q10).

Note that Aaron and Lina work the **runner** queue but may submit to **tech** —
that's how the tech queue gets enough tickets to test ordering with only seven
people, and it exercises "a person can be both submitter and worker".

---

## The steps

### Q0 — Entitlements, before anything is submitted
Everyone opens the Requests tab and reports what they see.

- Justin, Fabricio — the **tech queue as the main content**, plus all three
  submit buttons under "Need help yourself?".
- Aaron, Lina — the **runner queue** as main content, plus all three submit buttons.
- Laetitia, Rachel — all three submit buttons, no queue.
- Tyson — **only** "Ask a Rules Question".

### Q1 — Submit, live arrival, push
Laetitia submits a **tech** ticket: room 101, "projector dead". Phone typed for
the first time.
Expected: it appears in Justin and Fabricio's queue **without either
refreshing**, and both get a push. Aaron and Lina see nothing.
Laetitia sees it in My Requests at **position 1**.

### Q2 — FIFO order
Rachel submits tech (room 102), then Lina submits tech (room 103).
Expected: Rachel **2**, Lina **3**, Laetitia still **1**. Workers see three
tickets, oldest first.

Lina is a runner worker submitting to tech — the ticket must land in the tech
queue, and must **not** appear in Lina's own runner queue view.

### Q3 — Phone remembered, room re-asked
Laetitia submits a second tech ticket (room 104).
Expected: the phone field is **pre-filled**; the room field is **blank**.
Laetitia now has two tickets in My Requests, at **1** and **4**.

Queue is now: Laetitia 1 · Rachel 2 · Lina 3 · Laetitia 4.

### Q4 — Atomic claim
Justin counts down. **Justin and Fabricio both tap Claim on ticket #1 at the
same time.**
Expected: exactly one wins. The ticket shows Claimed once, by one name. The
loser gets an error or simply sees it flip to claimed — never both, never a
double-claim. Laetitia gets a "claimed" push.

### Q5 — Who can see what
Laetitia reports: only their own two tickets and their positions — no other
people's tickets, no one else's phone number.
Justin and Fabricio report: they can see the requester's phone number.

### Q6 — Drop by the worker who didn't claim it
Whichever of Justin/Fabricio **lost** Q4 taps Drop on that ticket.
Expected: it returns to Open for both tech workers.
**Laetitia gets no push** — release is silent.
**Laetitia's position is still 1** — dropping keeps the ticket active.

### Q7 — Queue isolation
Laetitia submits a **runner** ticket.
Expected: it appears for Aaron and Lina only, and both get a push. It does not
appear in the tech queue, and the four tech tickets never appear in the runner
queue.

### Q8 — Resolve and recompute
A tech worker claims ticket #1 and **Resolves** it.
Expected: Laetitia gets a "resolved" push; the ticket leaves both workers'
queues; the rest move up — **Rachel 2→1, Lina 3→2, Laetitia's second 4→3.**

Positions must only ever drop. Anyone whose number goes *up* is a finding.

### Q9 — Requester cancels
Rachel cancels their own ticket from My Requests.
Expected: gone from Rachel's strip and from the workers' queue, no push to
workers, and Laetitia's second ticket moves **3→2**.

### Q10 — Coach restriction
Tyson submits the one thing available, an **academic** ticket.
Expected: it appears in **no one's** queue — not tech, not runner. Tyson sees it
with a position. There is no tech or runner option anywhere in Tyson's UI.

### Q11 — Runner lifecycle
Rachel submits a runner ticket. Aaron claims → Lina drops → Aaron re-claims →
Aaron resolves.
Expected: identical behaviour to tech. Pushes to Rachel on claim and resolve,
silence on the drop.

### Q12 — Worker submits to their own queue *(optional)*
Fabricio submits a **tech** ticket.
Expected: it lands in the tech queue like any other and Fabricio sees it there.
Note whether Fabricio also gets the worker push for their own ticket — either
behaviour is defensible, we just want to know which.

### Q13 — Delegate has no Requests tab *(Justin, solo — 30 seconds)*
At the end, Justin logs out and logs in as **Dana Delegate (200010)**.
Expected: **no Requests tab in the bottom bar at all.** Then log back in as
Theo Tech.

---

## Not covered

Accepted gaps at 7 people:

- **Audience counts are inflated by the Part 2 cast**, which stays seeded
  throughout. That is the price of no mid-session reseed: no send's confirmation
  number equals the number of phones. The counts in this doc are the real
  both-casts figures, verified against Firestore — a *mismatch* is still a
  finding.
- **Three of the five volunteer roles are unmanned in Part 1** (T3), so the
  All-Volunteers expansion is confirmed by the audience count rather than by
  five phones.
- **Only one manned Coach** (Rachel), so Coach Beta's side of T2 is a count, not
  a banner.
- **The cross-queue security rule is untestable from a phone.** A worker is only
  ever shown their own queue, so the UI never offers a Runner a tech ticket to
  claim. Q7 proves *visibility* isolation, not the rule. To exercise it, hit
  Firestore with a script signed in as a Runner and attempt a write to a tech
  ticket — expect `permission-denied`.
- **The academic queue's `open → resolved` path is never worked**, since Vera is
  unmanned. Q10 only checks that academic tickets stay out of the other queues.
