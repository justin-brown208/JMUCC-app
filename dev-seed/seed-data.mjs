// ===========================================================================
// TEST SEED DATA — DEV ONLY. DELETE BEFORE GO-LIVE. See README.md.
// ===========================================================================
//
// Every document ID here is prefixed "test-" so it is obvious in the console
// and so purge.mjs can find and remove all of it safely.
//
// This mirrors SCHEMA.md. If SCHEMA.md changes, change this too.
//
// ONE CAST OF 10, seeded once before the session and never touched again.
// Each tester holds a single PIN for the whole of TESTING.md — notification
// targeting and the request queues both run against this same roster, so
// nobody logs out mid-session and there is no reseed between the two parts.
//
// The consequence that shapes every seat below: a send's audience is exactly
// the set of phones in the room. There are no unmanned identities padding the
// count, so every number on the confirmation screen is directly checkable
// against who actually buzzes.
//
// The tight part is fitting both parts' needs into 10 seats. What forced the
// shape:
//   - Both flags sit on the sender. isAdmin and managesAcademicQueue are
//     independent of role (SCHEMA.md), so the one Organizer carries both:
//     he sends every notification AND works the academic queue. That frees a
//     seat and still leaves an Organizer as the "not a volunteer role" control.
//   - Two tech volunteers, not three. Two is the minimum that tests both an
//     atomic claim race and "a worker who didn't claim it can still drop it".
//   - One runner. Runner and tech are the same collection, trigger and panel,
//     so runner only needs a confirmation pass; a lone worker can still walk
//     claim -> drop -> re-claim -> resolve.
//   - Two delegates, and the coach moved to Crossfield. Three delegates would
//     cost a volunteer seat. Targeting "Delegate + Coach" instead of "Delegate"
//     keeps the division-vs-letter split just as sharp (the coach becomes the
//     person in both sets) — see TESTING.md T5/T6.
// That buys all five volunteer roles on real phones, which is what makes the
// "All Volunteers" shortcut fail by name instead of by a low count.
//
// The `tester` field is NOT written to Firestore; seed.mjs strips it and only
// uses it to print the who-holds-what cheat sheet.

// --- schools (collection: schools) -----------------------------------------
// Fields per SCHEMA.md: name, division (1-6|null), teamLetter ("A"-"D"|null).
// All three have their ceremony mapping already published so team resolution
// can be tested end to end.
//
// Crossfield exists to DECORRELATE division from teamLetter. With only Alpha
// (1/A) and Beta (2/B), "division 1" and "letter A" select the identical set of
// people, so a send function that read teamLetter where it meant division would
// pass every possible test. Crossfield shares a division with Alpha and a
// letter with Beta, making the three filters return three different sets:
//   division 1 -> Alpha + Crossfield
//   letter A   -> Alpha
//   letter B   -> Beta + Crossfield
export const schools = [
  { id: "test-school-alpha",      name: "Alpha University",      division: 1, teamLetter: "A" },
  { id: "test-school-beta",       name: "Beta College",          division: 2, teamLetter: "B" },
  { id: "test-school-crossfield", name: "Crossfield University", division: 1, teamLetter: "B" },
];

// --- people (collection: people) -------------------------------------------
// Fields per SCHEMA.md: fullName, role, pin (6-digit string), school (id|null),
// isAdmin (bool), managesAcademicQueue (bool, optional). Document ID doubles as
// the person's future auth uid.
export const people = [
  // The sender, and the academic queue's one worker. Both flags on one person,
  // neither implied by the role (SCHEMA.md): isAdmin opens the Admin panel,
  // managesAcademicQueue opens the Rules Questions queue. As an Organizer he
  // may submit to nothing — the only seat where work-rights and submit-rights
  // disagree — and he is the control proving Organizer is NOT a volunteer role.
  { id: "test-organizer",       tester: "Justin",   fullName: "Olivia Organizer", role: "Organizer", pin: "100001", school: null, isAdmin: true, managesAcademicQueue: true },

  // Delegates — two schools, two divisions, two letters. Cannot submit to any
  // queue and must not see a Requests tab at all.
  { id: "test-delegate-alpha",  tester: "Fabricio", fullName: "Ada Delegate",    role: "Delegate", pin: "100002", school: "test-school-alpha", isAdmin: false },
  { id: "test-delegate-beta",   tester: "Aaron",    fullName: "Grace Delegate",  role: "Delegate", pin: "100003", school: "test-school-beta",  isAdmin: false },

  // Coach at Crossfield — division 1 like Alpha, letter B like Beta, so this
  // is the seat that appears in BOTH the division-1 and letter-B results and
  // proves the two filters are reading different fields (TESTING.md T5/T6).
  // Also the restricted submitter: academic queue only, nothing else.
  { id: "test-coach-crossfield", tester: "Rachel",  fullName: "Casey Coach",     role: "Coach",    pin: "100004", school: "test-school-crossfield", isAdmin: false },

  // Team Ambassador — a VOLUNTEER role that still carries a school ("the team
  // I'm assigned to"). The load-bearing seat: "All Volunteers" must reach this
  // person AND so must "letter A", and the team comes from the school lookup
  // rather than any field on the person.
  { id: "test-ambassador",      tester: "Laetitia", fullName: "Amir Ambassador", role: "Team Ambassador", pin: "100005", school: "test-school-alpha", isAdmin: false },

  // Tech queue workers. Two is deliberate and is the minimum: the atomic-claim
  // race needs two tapping at once, and the loser then proves that a worker who
  // did NOT claim a ticket can still drop it back to the pool.
  { id: "test-tech-1",          tester: "Meriem",   fullName: "Tia Tech",        role: "Tech Volunteer", pin: "100006", school: null, isAdmin: false },
  { id: "test-tech-2",          tester: "Tara",     fullName: "Theo Tech",       role: "Tech Volunteer", pin: "100007", school: null, isAdmin: false },

  // Runner queue worker — sole holder, which is enough because runner is the
  // same code path as tech. Also a submitter to tech, which is how a worker
  // gets to be a requester somewhere else.
  { id: "test-runner",          tester: "Tyson",    fullName: "Remy Runner",     role: "Runner",         pin: "100008", school: null, isAdmin: false },

  // The last two volunteer roles. They work no queue, so they may submit to all
  // three, and together with the seats above every one of the five volunteer
  // roles is on a real phone for the "All Volunteers" shortcut.
  { id: "test-general",         tester: "Lina",     fullName: "Gene General",    role: "General Volunteer", pin: "100009", school: null, isAdmin: false },
  { id: "test-room",            tester: "Shehroz",  fullName: "Riya Room",       role: "Presentation Room Coordinator", pin: "100010", school: null, isAdmin: false },
];

// Teamless volunteers (tech x2, runner, general, room) are the negative control
// for every team filter: five volunteers with no school, so any division /
// letter / school filter that reaches one of them is a bug (TESTING.md T8).
