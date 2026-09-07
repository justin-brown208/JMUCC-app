// ===========================================================================
// TEST SEED DATA — DEV ONLY. DELETE BEFORE GO-LIVE. See README.md.
// ===========================================================================
//
// Every document ID here is prefixed "test-" so it is obvious in the console
// and so purge.mjs can find and remove all of it safely.
//
// This mirrors SCHEMA.md. If SCHEMA.md changes, change this too.
//
// Built to run TESTING.md, which has two parts with DIFFERENT app roles for the
// same 10 people, under separate PIN blocks (Part 1 = 1000xx, Part 2 = 2000xx).
//
// ONLY ONE CAST IS IN FIRESTORE AT A TIME. `node seed.mjs part1` writes the
// Part 1 cast and removes the Part 2 one, and vice versa. They cannot coexist:
// both casts use the same role values, so a Part 1 send targeting "Delegate"
// would also match the Part 2 delegate and every recipient count in TESTING.md
// Part 1 would be wrong — and that count is itself under test.
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

// PART 1 — notification targeting (TESTING.md Part 1). PINs 100001+.
// Shaped so every targeting filter has both people who should receive and
// people who should not: three delegates spread across the three schools, two
// coaches, one ambassador (a volunteer role that still carries a school), and
// three teamless volunteers as the negative control for team filters.
export const peopleP1 = [
  // Delegates — one per school, so division and letter filters split them
  { id: "test-p1-delegate-alpha",      tester: "Fabricio", fullName: "Ada Delegate",    role: "Delegate", pin: "100001", school: "test-school-alpha",      isAdmin: false },
  { id: "test-p1-delegate-beta",       tester: "Aaron",    fullName: "Grace Delegate",  role: "Delegate", pin: "100002", school: "test-school-beta",       isAdmin: false },
  { id: "test-p1-delegate-crossfield", tester: "Lina",   fullName: "Cleo Delegate",   role: "Delegate", pin: "100003", school: "test-school-crossfield", isAdmin: false },

  // Coaches — Alpha and Beta
  { id: "test-p1-coach-alpha",         tester: "Rachel",     fullName: "Coach Alpha",     role: "Coach",    pin: "100004", school: "test-school-alpha",      isAdmin: false },
  { id: "test-p1-coach-beta",          tester: null,     fullName: "Coach Beta",      role: "Coach",    pin: "100005", school: "test-school-beta",       isAdmin: false },

  // Team Ambassador — a VOLUNTEER role that still carries a school ("the team
  // I'm assigned to"). The load-bearing seat: "All Volunteers" must reach this
  // person AND so must "letter A".
  { id: "test-p1-ambassador-alpha",    tester: "Laetitia", fullName: "Amir Ambassador", role: "Team Ambassador", pin: "100006", school: "test-school-alpha", isAdmin: false },

  // Teamless volunteers — the control group. Any division/letter/school filter
  // that reaches these three is a bug.
  { id: "test-p1-tech",                tester: null,   fullName: "Tia Tech",        role: "Tech Volunteer",    pin: "100007", school: null, isAdmin: false },
  { id: "test-p1-runner",              tester: "Tyson",    fullName: "Remy Runner",     role: "Runner",            pin: "100008", school: null, isAdmin: false },
  { id: "test-p1-general",             tester: null,  fullName: "Gene General",    role: "General Volunteer", pin: "100009", school: null, isAdmin: false },

  // The sender (isAdmin decoupled from role, per SCHEMA.md)
  { id: "test-p1-organizer",           tester: "Justin",   fullName: "Olivia Organizer", role: "Organizer", pin: "100010", school: null, isAdmin: true },

  // UNMANNED — the 5th volunteer role. Nobody logs in as Riya; the "All
  // Volunteers" shortcut is confirmed to include this seat via the admin
  // audience confirmation / Tracking list rather than a phone.
  { id: "test-p1-room",                tester: null,       fullName: "Riya Room",       role: "Presentation Room Coordinator", pin: "100011", school: null, isAdmin: false },
];

// PART 2 — runner / tech queues (TESTING.md Part 2). PINs 200001+.
// Same 10 people, different app roles, because queue submitters and workers
// have to be volunteers. THREE tech volunteers is deliberate: atomic claim
// needs two tapping at once, and "any worker can free an abandoned claim"
// needs a third who didn't claim it.
//
// The only managesAcademicQueue holder here is unmanned, so the coach's
// academic ticket is meant to sit unworked (TESTING.md Q11).
export const peopleP2 = [
  // Tech queue workers
  { id: "test-p2-tech-1",     tester: "Justin",   fullName: "Theo Tech",      role: "Tech Volunteer", pin: "200001", school: null, isAdmin: false },
  { id: "test-p2-tech-2",     tester: "Fabricio", fullName: "Tess Tech",      role: "Tech Volunteer", pin: "200002", school: null, isAdmin: false },
  { id: "test-p2-tech-3",     tester: null,    fullName: "Tobias Tech",    role: "Tech Volunteer", pin: "200003", school: null, isAdmin: false },

  // Runner queue workers
  { id: "test-p2-runner-1",   tester: "Aaron",   fullName: "Rosa Runner",    role: "Runner",         pin: "200004", school: null, isAdmin: false },
  { id: "test-p2-runner-2",   tester: "Lina",     fullName: "Rex Runner",     role: "Runner",         pin: "200005", school: null, isAdmin: false },

  // Pure submitters — volunteer roles that work no queue, so they may submit to
  // all three. Between these and the workers above, all 5 volunteer roles are
  // represented.
  { id: "test-p2-general",    tester: null,     fullName: "Gwen General",   role: "General Volunteer", pin: "200006", school: null, isAdmin: false },
  { id: "test-p2-room",       tester: "Laetitia", fullName: "Piper Room",     role: "Presentation Room Coordinator", pin: "200007", school: null, isAdmin: false },
  { id: "test-p2-ambassador", tester: "Rachel",   fullName: "Ana Ambassador", role: "Team Ambassador",   pin: "200008", school: "test-school-alpha", isAdmin: false },

  // Restricted submitter — academic only
  { id: "test-p2-coach",      tester: "Tyson",    fullName: "Casey Coach",    role: "Coach",    pin: "200009", school: "test-school-beta",  isAdmin: false },

  // Cannot submit at all — should see no Requests tab
  { id: "test-p2-delegate",   tester: null,  fullName: "Dana Delegate",  role: "Delegate", pin: "200010", school: "test-school-alpha", isAdmin: false },

  // UNMANNED — the only holder of managesAcademicQueue. Seeded so the academic
  // path exists and can be spot-checked later, but nobody logs in as Vera, so
  // the coach's academic ticket sits unworked as Q11 expects. Flag, not a role.
  { id: "test-p2-vp-academics", tester: null,     fullName: "Vera VP",        role: "Organizer", pin: "200011", school: null, isAdmin: false, managesAcademicQueue: true },
];

export const people = [...peopleP1, ...peopleP2];
