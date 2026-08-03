import type { View } from "../App";

/**
 * Internal navigation for the Admin area (PAGES.md §7–8): a back-to-Home link
 * plus tabs between the two admin pages. Shared by Compose and Tracking.
 */
export function AdminNav({
  active,
  onNavigate,
}: {
  active: "compose" | "tracking";
  onNavigate: (view: View) => void;
}) {
  return (
    <div className="admin-nav">
      <button className="back" type="button" onClick={() => onNavigate("home")}>
        ‹ Home
      </button>
      <div className="admin-tabs">
        <button
          type="button"
          className={"admin-tab" + (active === "compose" ? " active" : "")}
          onClick={() => onNavigate("compose")}
        >
          Compose
        </button>
        <button
          type="button"
          className={"admin-tab" + (active === "tracking" ? " active" : "")}
          onClick={() => onNavigate("tracking")}
        >
          Tracking
        </button>
      </div>
    </div>
  );
}
