import { signInWithCustomToken, signOut } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "./firebase";

// The profile returned by authenticateWithPin. The custom token only carries the
// uid, so this (name, role, team, flags) is cached client-side for greeting,
// calendar merging, and admin/queue gating on reload.
export interface Profile {
  fullName: string;
  role: string;
  isAdmin: boolean;
  /** Queues worked on top of the role's own (e.g. a TA who also runs). */
  worksQueues: string[];
  /** A Team Ambassador has both; a PRC only the number of their classroom. */
  wave: string | null;
  teamNumber: number | null;
}

interface AuthResult {
  token: string;
  profile: Profile;
}

const PROFILE_KEY = "jmucc.profile";

export function getCachedProfile(): Profile | null {
  const raw = localStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Profile;
    // A profile cached by the main JMUCC build has none of the NextGen team
    // fields — treat it as signed out so the person re-enters a PIN.
    return Array.isArray(p.worksQueues) ? p : null;
  } catch {
    return null;
  }
}

/**
 * Exchange a 6-digit PIN for a signed-in session. Calls authenticateWithPin,
 * caches the returned profile, then signs in with the custom token.
 *
 * The cache is written BEFORE signInWithCustomToken so it is already present
 * when onAuthStateChanged fires — otherwise App could observe the new session
 * before the profile exists.
 */
export async function signInWithPin(pin: string): Promise<Profile> {
  const call = httpsCallable<{ pin: string }, AuthResult>(
    functions,
    "authenticateWithPin"
  );
  const { data } = await call({ pin });
  localStorage.setItem(PROFILE_KEY, JSON.stringify(data.profile));
  await signInWithCustomToken(auth, data.token);
  return data.profile;
}

export async function logout(): Promise<void> {
  localStorage.removeItem(PROFILE_KEY);
  await signOut(auth);
}
