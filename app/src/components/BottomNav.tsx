import type { ReactNode } from "react";
import type { Profile } from "../auth";
import { submittableQueues, workedQueue } from "../requests";

// The five possible destinations. Which ones actually show is role-aware
// (see `tabsFor`): everyone gets Home/Rules/Messages; Requests appears for
// people who can submit or work a queue; Admin only for the isAdmin flag.
export type TabId = "home" | "rules" | "messages" | "requests" | "admin";

// Line icons, drawn with currentColor so the gold(active)/muted(inactive) swap
// is free. Kept inline (no icon dependency — the app stays self-contained).
const ICONS: Record<TabId, ReactNode> = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9.5h13V10" />
    </svg>
  ),
  rules: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 6C10.2 4.7 8 4.2 5.5 4.2V18c2.5 0 4.7.5 6.5 1.8 1.8-1.3
        4-1.8 6.5-1.8V4.2C16 4.2 13.8 4.7 12 6Z" />
      <path d="M12 6v13.8" />
    </svg>
  ),
  messages: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 10a6 6 0 0 1 12 0c0 4.5 2 5.5 2 5.5H4S6 14.5 6 10Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  ),
  requests: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M9.5 9.5 6 6M14.5 9.5 18 6M9.5 14.5 6 18M14.5 14.5 18 18" />
    </svg>
  ),
  admin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h7M15 17h5" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="8" cy="12" r="2" />
      <circle cx="13" cy="17" r="2" />
    </svg>
  ),
};

const LABELS: Record<TabId, string> = {
  home: "Home",
  rules: "Rules",
  messages: "Messages",
  requests: "Requests",
  admin: "Admin",
};

// The visible tabs for this person, left→right.
export function tabsFor(profile: Profile): TabId[] {
  const tabs: TabId[] = ["home", "rules", "messages"];
  if (submittableQueues(profile).length > 0 || workedQueue(profile)) {
    tabs.push("requests");
  }
  if (profile.isAdmin) tabs.push("admin");
  return tabs;
}

/**
 * Persistent bottom navigation. Active tab reads gold (icon + label + a top
 * tick-bar echoing the design's accent-bar motif); the rest are muted. Flat, no
 * fills — state is carried by color, per DESIGN.md.
 */
export function BottomNav({
  profile,
  active,
  onSelect,
}: {
  profile: Profile;
  active: TabId;
  onSelect: (tab: TabId) => void;
}) {
  return (
    <nav className="bottom-nav">
      {tabsFor(profile).map((id) => (
        <button
          key={id}
          type="button"
          className={"nav-item" + (active === id ? " nav-item--active" : "")}
          aria-label={LABELS[id]}
          aria-current={active === id ? "page" : undefined}
          onClick={() => onSelect(id)}
        >
          <span className="nav-tick" />
          {ICONS[id]}
        </button>
      ))}
    </nav>
  );
}
