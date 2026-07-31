import { useEffect } from "react";
import { logout, type Profile } from "../auth";
import { registerForPush } from "../fcm";
import type { View } from "../App";

/**
 * Home — still a stub for most of PAGES.md §2 (schedule widget, latest message,
 * requests zone come later). For now it confirms the login round-trip and, when
 * the person is an admin, is the entry point into the Compose screen.
 */
export function Home({
  profile,
  onNavigate,
}: {
  profile: Profile;
  onNavigate: (view: View) => void;
}) {
  const firstName = profile.fullName.split(" ")[0];

  // Register this device for push once we're on Home and signed in.
  // No-ops safely where push isn't available (see registerForPush).
  useEffect(() => {
    registerForPush();
  }, []);

  return (
    <div className="screen">
      <h1 className="title">Home</h1>
      <p className="greeting">Hello {firstName}</p>
      <p className="help">
        Signed in as {profile.role}
        {profile.teamLetter ? ` · Team ${profile.teamLetter}` : ""}
      </p>

      {profile.isAdmin && (
        <button
          className="btn"
          type="button"
          onClick={() => onNavigate("compose")}
        >
          Admin
        </button>
      )}

      <button className="btn-secondary" type="button" onClick={() => logout()}>
        Log out
      </button>
    </div>
  );
}
