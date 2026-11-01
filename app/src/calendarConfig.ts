// Google Calendar integration config.
//
// The calendars are PUBLIC and read-only, so the calendar IDs and the API key
// are public identifiers (safe to commit) — same posture as the Firebase web
// config. Fill these in once the organizers have:
//   1. Created the calendars below and made each one **public**
//      (Calendar settings → "Make available to public").
//   2. An API key restricted to the Calendar API (the JMUCC key is reused).
//
// A calendar ID looks like "abc123...@group.calendar.google.com" (Calendar
// settings → "Integrate calendar" → Calendar ID). Any calendar left empty is
// skipped, so only the ones actually needed have to exist.

export const CALENDAR_API_KEY = "AIzaSyDdQTUtnuVfL28e5zT4aTLuwTBm1uNpggI";

// NextGen calendars: an everyone-Global, one per role (the day-of run sheet
// splits by job — TA schedule, PRC schedule…), and one per wave, because a Team
// Ambassador's timings depend entirely on their wave. Each person sees Global +
// their role's calendar + (if they have one) their wave's.
export const CALENDARS = {
  global: "",
  organizers: "",
  teamAmbassadors: "",
  prcs: "",
  tech: "",
  floaters: "",
  runners: "",
  waveA: "",
  waveB: "",
  waveC: "",
} as const;
