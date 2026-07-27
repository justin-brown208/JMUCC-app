import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import { getCachedProfile, type Profile } from "./auth";
import { Registration } from "./screens/Registration";
import { Home } from "./screens/Home";

function App() {
  // undefined = auth state not resolved yet (restoring a persisted session);
  // null = signed out; Profile = signed in.
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setProfile(user ? getCachedProfile() : null);
    });
  }, []);

  // Hold the first paint until Firebase has restored (or cleared) the session,
  // so a returning user never flashes the Registration screen.
  if (profile === undefined) return null;

  return profile ? <Home profile={profile} /> : <Registration />;
}

export default App;
