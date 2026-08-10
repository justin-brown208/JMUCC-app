// ===========================================================================
// TEST SEED DATA — DEV ONLY. DELETE BEFORE GO-LIVE. See README.md.
// ===========================================================================
//
// Every document ID here is prefixed "test-" so it is obvious in the console
// and so purge.mjs can find and remove all of it safely.
//
// This mirrors SCHEMA.md. If SCHEMA.md changes, change this too.
//
// Two schools in different divisions/letters + ~14 people covering all 8 roles,
// with extra delegates/coaches per school, so notification targeting and
// calendar merging can actually be exercised.

// --- schools (collection: schools) -----------------------------------------
// Fields per SCHEMA.md: name, division (1-6|null), teamLetter ("A"-"D"|null).
// These two have their ceremony mapping already published so team resolution
// can be tested end to end.
export const schools = [
  { id: "test-school-alpha", name: "Alpha University", division: 1, teamLetter: "A" },
  { id: "test-school-beta",  name: "Beta College",     division: 2, teamLetter: "B" },
];

// --- people (collection: people) -------------------------------------------
// Fields per SCHEMA.md: fullName, role, pin (6-digit string), school (id|null),
// isAdmin (bool). Document ID doubles as the person's future auth uid.
//
// PINs are simple sequential test values (100001+) for easy typing during dev.
// The real roster gets proper PINs later.
export const people = [
  // Delegates — 2 at Alpha, 2 at Beta (multiple per school on purpose)
  { id: "test-delegate-alpha-1", fullName: "Ada Delegate",    role: "Delegate", pin: "100001", school: "test-school-alpha", isAdmin: false },
  { id: "test-delegate-alpha-2", fullName: "Alan Delegate",   role: "Delegate", pin: "100002", school: "test-school-alpha", isAdmin: false },
  { id: "test-delegate-beta-1",  fullName: "Grace Delegate",  role: "Delegate", pin: "100003", school: "test-school-beta",  isAdmin: false },
  { id: "test-delegate-beta-2",  fullName: "Katherine Deleg", role: "Delegate", pin: "100004", school: "test-school-beta",  isAdmin: false },

  // Coaches — Alpha and Beta
  { id: "test-coach-alpha",      fullName: "Coach Alpha",     role: "Coach",    pin: "100005", school: "test-school-alpha", isAdmin: false },
  { id: "test-coach-beta",       fullName: "Coach Beta",      role: "Coach",    pin: "100006", school: "test-school-beta",  isAdmin: false },

  // Organizer — the one admin (isAdmin decoupled from role, per SCHEMA.md)
  { id: "test-organizer",        fullName: "Olivia Organizer", role: "Organizer", pin: "100007", school: null, isAdmin: true },

  // Presentation Room Coordinator (a volunteer role) — no school
  { id: "test-room-coordinator", fullName: "Riya Room",       role: "Presentation Room Coordinator", pin: "100008", school: null, isAdmin: false },

  // Team Ambassadors — carry a school ("the team I'm assigned to"), one per team
  { id: "test-ambassador-alpha", fullName: "Amir Ambassador", role: "Team Ambassador", pin: "100009", school: "test-school-alpha", isAdmin: false },
  { id: "test-ambassador-beta",  fullName: "Bella Ambassador", role: "Team Ambassador", pin: "100010", school: "test-school-beta", isAdmin: false },

  // Remaining volunteer roles — no school
  { id: "test-tech-volunteer",    fullName: "Tia Tech",       role: "Tech Volunteer",    pin: "100011", school: null, isAdmin: false },
  { id: "test-general-volunteer", fullName: "Gene General",   role: "General Volunteer", pin: "100012", school: null, isAdmin: false },
  { id: "test-runner",            fullName: "Remy Runner",    role: "Runner",            pin: "100013", school: null, isAdmin: false },

  // Extra coach at Alpha — gives Alpha a fuller roster for targeting tests
  { id: "test-coach-alpha-2",     fullName: "Cory Coach",     role: "Coach",             pin: "100014", school: "test-school-alpha", isAdmin: false },

  // VP Academics — an OC member carrying the managesAcademicQueue flag (works
  // the academic request queue). "VP Academics" isn't a role; flag ≠ isAdmin.
  { id: "test-vp-academics",      fullName: "Vera VP",        role: "Organizer",         pin: "100015", school: null, isAdmin: false, managesAcademicQueue: true },
];
