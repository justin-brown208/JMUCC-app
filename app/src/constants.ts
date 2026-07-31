// Client-side domain constants. Mirrors functions/src/constants.ts — kept in
// sync by hand (two runtimes, no shared package). The composer sends real role
// values; "All Volunteers" is a UI shortcut that expands to VOLUNTEER_ROLES.

export const ROLES = [
  "Delegate",
  "Coach",
  "Organizer",
  "Presentation Room Coordinator",
  "Team Ambassador",
  "Tech Volunteer",
  "General Volunteer",
  "Runner",
] as const;

// The 3 non-volunteer roles — shown on the top recipient row alongside the
// "All Volunteers" shortcut; the 5 volunteer roles sit below the divider.
export const NON_VOLUNTEER_ROLES = ["Delegate", "Coach", "Organizer"] as const;

export const VOLUNTEER_ROLES = [
  "Presentation Room Coordinator",
  "Team Ambassador",
  "Tech Volunteer",
  "General Volunteer",
  "Runner",
] as const;

export const NOTIFICATION_TITLES = [
  "Message",
  "Announcement",
  "Reminder",
] as const;

export const DIVISIONS = [1, 2, 3, 4, 5, 6] as const;
export const TEAM_LETTERS = ["A", "B", "C", "D"] as const;
