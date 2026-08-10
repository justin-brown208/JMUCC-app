import type { Profile } from "./auth";
import { VOLUNTEER_ROLES } from "./constants";
import { CALENDAR_API_KEY, CALENDARS } from "./calendarConfig";

export interface ScheduleEvent {
  id: string;
  title: string;
  description: string | null;
  start: Date;
  end: Date | null;
  allDay: boolean;
  location: string | null;
}

const PLACEHOLDER = /^PASTE_/;
const CACHE_KEY = "jmucc.schedule";

// The calendars a person sees: Global + their one role-group calendar + (if
// they have a team) their team-letter calendar. A Team Ambassador is a
// volunteer role with a team, so this naturally yields Global + Volunteers +
// Team X — no special-casing (see CLAUDE.md → Calendar).
function calendarIdsFor(profile: Profile): string[] {
  const ids: string[] = [CALENDARS.global];

  if (profile.role === "Delegate") ids.push(CALENDARS.delegates);
  else if (profile.role === "Coach") ids.push(CALENDARS.coaches);
  else if (profile.role === "Organizer") ids.push(CALENDARS.organizers);
  else if (VOLUNTEER_ROLES.includes(profile.role as never)) {
    ids.push(CALENDARS.volunteers);
  }

  const team =
    profile.teamLetter &&
    CALENDARS[`team${profile.teamLetter}` as keyof typeof CALENDARS];
  if (team) ids.push(team);

  // Drop unfilled placeholders + dedupe.
  return [...new Set(ids.filter((id) => id && !PLACEHOLDER.test(id)))];
}

interface GCalItem {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

// Google Calendar descriptions can contain HTML — flatten to plain text so the
// widget renders clean, readable subtext (React would otherwise show raw tags).
function plainText(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function toEvent(item: GCalItem): ScheduleEvent | null {
  const startRaw = item.start?.dateTime ?? item.start?.date;
  if (!startRaw) return null;
  const allDay = !item.start?.dateTime;
  const endRaw = item.end?.dateTime ?? item.end?.date ?? null;
  const description = item.description ? plainText(item.description) : "";
  return {
    id: item.id,
    title: item.summary ?? "(untitled)",
    description: description || null,
    start: new Date(startRaw),
    end: endRaw ? new Date(endRaw) : null,
    allDay,
    location: item.location ?? null,
  };
}

async function fetchCalendar(
  calendarId: string,
  timeMinIso: string
): Promise<ScheduleEvent[]> {
  const url =
    `https://www.googleapis.com/calendar/v3/calendars/` +
    `${encodeURIComponent(calendarId)}/events` +
    `?key=${CALENDAR_API_KEY}` +
    `&timeMin=${encodeURIComponent(timeMinIso)}` +
    `&singleEvents=true&orderBy=startTime&maxResults=20`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Calendar ${calendarId}: HTTP ${res.status}`);
  const data = (await res.json()) as { items?: GCalItem[] };
  return (data.items ?? [])
    .map(toEvent)
    .filter((e): e is ScheduleEvent => e !== null);
}

// Instant paint: the last-fetched schedule from localStorage (dates revived).
export function cachedSchedule(): ScheduleEvent[] | null {
  const raw = localStorage.getItem(CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ScheduleEvent[];
    return parsed.map((e) => ({
      ...e,
      start: new Date(e.start),
      end: e.end ? new Date(e.end) : null,
    }));
  } catch {
    return null;
  }
}

/**
 * Fetch upcoming events across the person's calendars, merged and sorted by
 * start time. No-ops (returns []) until the API key + calendar IDs are filled.
 * Result is cached to localStorage so cachedSchedule() can paint instantly on
 * the next visit (stale-while-revalidate).
 */
export async function loadSchedule(profile: Profile): Promise<ScheduleEvent[]> {
  if (!CALENDAR_API_KEY || PLACEHOLDER.test(CALENDAR_API_KEY)) return [];
  const ids = calendarIdsFor(profile);
  if (ids.length === 0) return [];

  const timeMin = new Date().toISOString();
  const perCalendar = await Promise.all(
    ids.map((id) =>
      fetchCalendar(id, timeMin).catch((e) => {
        console.warn("Schedule fetch failed:", e);
        return [] as ScheduleEvent[];
      })
    )
  );

  const merged = perCalendar
    .flat()
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  localStorage.setItem(CACHE_KEY, JSON.stringify(merged));
  return merged;
}
