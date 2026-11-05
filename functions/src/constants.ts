/**
 * Shared domain constants. Kept in one place so the send function, the
 * requests trigger, and validation all agree on the canonical values.
 *
 * NextGen branch: a volunteers-only event. Teams are 2 waves (A–B) × team
 * numbers 1–3, stored directly on the person (`wave`, `teamNumber`) — there
 * are no schools and no delegates/coaches.
 */

// The flat list of 6 roles. "Volunteer" is a UI grouping, never a stored value
// — the composer expands it to the 5 volunteer roles before calling, so the
// function only ever sees real role values.
export const ROLES = [
  "Organizer",
  "Presentation Room Coordinator",
  "Team Ambassador",
  "Tech Volunteer",
  "Floater",
  "Runner",
] as const;

export type Role = (typeof ROLES)[number];

/** The 5 volunteer roles (the "All Volunteers" shortcut expands to these). */
export const VOLUNTEER_ROLES: readonly Role[] = [
  "Presentation Room Coordinator",
  "Team Ambassador",
  "Tech Volunteer",
  "Floater",
  "Runner",
];

// Notification titles are a fixed preset pick, not free text (2026-07-17).
export const NOTIFICATION_TITLES = [
  "Message",
  "Announcement",
  "Reminder",
] as const;

export const WAVES = ["A", "B"] as const;
export const TEAM_NUMBERS = [1, 2, 3] as const;

// The request queues. Who works one: its role (below) OR the queue listed in
// the person's `worksQueues` flag — so a Team Ambassador can also run errands.
export const QUEUES = ["tech", "runner"] as const;
export const QUEUE_ROLE: Record<string, string> = {
  tech: "Tech Volunteer",
  runner: "Runner",
};

/**
 * Does this person work the queue — by role or by the worksQueues flag?
 * @param {object} person A people doc (role, optional worksQueues).
 * @param {string} queue The queue id.
 * @return {boolean} Whether they may work it.
 */
export const worksQueue = (
  person: {role?: unknown; worksQueues?: unknown},
  queue: string
): boolean =>
  person.role === QUEUE_ROLE[queue] ||
  (Array.isArray(person.worksQueues) && person.worksQueues.includes(queue));
