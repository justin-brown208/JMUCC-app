// Google Calendar integration config.
//
// The calendars are PUBLIC and read-only, so the calendar IDs and the API key
// are public identifiers (safe to commit) — same posture as the Firebase web
// config. Fill these in once the OC has:
//   1. Created the calendars below and made each one **public**
//      (Calendar settings → "Make available to public").
//   2. Created a Google Cloud **API key** restricted to the Calendar API
//      (and ideally to the app's domains as HTTP referrers).
//
// A calendar ID looks like "abc123...@group.calendar.google.com" (Calendar
// settings → "Integrate calendar" → Calendar ID). Until an ID is filled, that
// calendar is skipped; until the API key is filled, the widget shows nothing.

export const CALENDAR_API_KEY = "AIzaSyDdQTUtnuVfL28e5zT4aTLuwTBm1uNpggI";

// The full-week schedule poster/grid — a single image the OC supplies before
// the event (any public image URL, e.g. a Firebase Storage download link).
// Shown in the zoomable viewer via Home's "View Full Week" button.
export const FULL_WEEK_IMAGE_URL = "https://upload.wikimedia.org/wikipedia/commons/d/d5/Retriever_in_water.jpg";

// The 9 calendars: everyone-Global, four role-groups (one shared Volunteers
// calendar for all volunteer roles), and the four team-letter calendars.
export const CALENDARS = {
  global: "c_56163710bbaa1ad403f0cd2d0d62fa181a058bf7a124bfa87545586583a3ffe8@group.calendar.google.com",
  delegates: "c_23305afc67456472945bec65f43f4293def6fdce9c7a421173c4ea70c5d871c5@group.calendar.google.com",
  coaches: "c_fb681d51ea0e3889949b73592130c79d043315f295f2c264b29403dcaa257ac6@group.calendar.google.com",
  organizers: "c_589a7a5ceee82f9e4f56a40f03b611b8c0b55c0f0f77140d877ef13a491303c6@group.calendar.google.com",
  volunteers: "c_281602e5f2e3e3fe7359b8d9d975fc0a0b84eb666db43da1dcbc8252651f9aea@group.calendar.google.com",
  teamA: "c_a2e57bd358b0848710d62d581fdfc8089e64e45e1ed325e6c3ff324a803a743f@group.calendar.google.com",
  teamB: "c_68ef27ea83f8e4eeb5eff3ea96bd79132516b55eb999d8e58f911008797c4a3b@group.calendar.google.com",
  teamC: "c_e0fcb010b3bfd81cbdc7ddc8b5eddf8d19b13624e973be0b3ca3c6c64a81cf8c@group.calendar.google.com",
  teamD: "c_7b3a53f85747b4ca66691f41219a768e74f40c7f69b440c154cca205b602016f@group.calendar.google.com",
} as const;
