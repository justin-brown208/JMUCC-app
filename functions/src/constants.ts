/**
 * Shared domain constants. Kept in one place so the send function, the (future)
 * requests trigger, and validation all agree on the canonical values.
 */

// The flat list of 8 roles (see CLAUDE.md > User). "Volunteer" is a UI
// grouping, never a stored value — the composer expands it to the 5 volunteer
// roles before calling, so the function only ever sees real role values.
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

export type Role = (typeof ROLES)[number];

/** The 5 volunteer roles (the "All Volunteers" shortcut expands to these). */
export const VOLUNTEER_ROLES: readonly Role[] = [
  "Presentation Room Coordinator",
  "Team Ambassador",
  "Tech Volunteer",
  "General Volunteer",
  "Runner",
];

// Notification titles are a fixed preset pick, not free text (2026-07-17).
export const NOTIFICATION_TITLES = [
  "Message from the Organizing Committee",
  "Reminder",
  "Urgent Message",
] as const;

export const TEAM_LETTERS = ["A", "B", "C", "D"] as const;
