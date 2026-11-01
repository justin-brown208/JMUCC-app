// Client-side domain constants. Mirrors functions/src/constants.ts — kept in
// sync by hand (two runtimes, no shared package). The composer sends real role
// values; "All Volunteers" is a UI shortcut that expands to VOLUNTEER_ROLES.
//
// NextGen branch: volunteers-only. Teams are waves A–C × team numbers 1–4,
// stored on the person — no schools, delegates or coaches.

export const ROLES = [
  "Organizer",
  "Presentation Room Coordinator",
  "Team Ambassador",
  "Tech Volunteer",
  "Floater",
  "Runner",
] as const;

// The non-volunteer role — shown on the top recipient row alongside the
// "All Volunteers" shortcut; the 5 volunteer roles sit below the divider.
export const NON_VOLUNTEER_ROLES = ["Organizer"] as const;

export const VOLUNTEER_ROLES = [
  "Presentation Room Coordinator",
  "Team Ambassador",
  "Tech Volunteer",
  "Floater",
  "Runner",
] as const;

export const NOTIFICATION_TITLES = [
  "Message",
  "Announcement",
  "Reminder",
] as const;

export const WAVES = ["A", "B", "C"] as const;
export const TEAM_NUMBERS = [1, 2, 3, 4] as const;
