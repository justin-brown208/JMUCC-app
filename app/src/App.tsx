import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import { getCachedProfile, type Profile } from "./auth";
import { Registration } from "./screens/Registration";
import { Home } from "./screens/Home";
import { Compose } from "./screens/admin/Compose";

// Minimal in-app navigation. One flat view state is enough for now; swap for a
// router if deep-linking or nested admin nav is ever needed.
export type View = "home" | "compose";

function App() {
  // undefined = auth state not resolved yet (restoring a persisted session);
  // null = signed out; Profile = signed in.
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [view, setView] = useState<View>("home");

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setProfile(user ? getCachedProfile() : null);
      setView("home"); // always land on Home across sign-in/out
    });
  }, []);

  // Hold the first paint until Firebase has restored (or cleared) the session,
  // so a returning user never flashes the Registration screen.
  if (profile === undefined) return null;
  if (!profile) return <Registration />;

  // Compose is admin-only; guard defensively even though the entry is gated.
  if (view === "compose" && profile.isAdmin) {
    return <Compose onBack={() => setView("home")} />;
  }
  return <Home profile={profile} onNavigate={setView} />;
}

export default App;
