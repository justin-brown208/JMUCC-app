import { logout, type Profile } from "../auth";

/**
 * Home — stub. Enough to confirm the login round-trip works end to end: it shows
 * the greeting from the cached profile and offers log out. The real Home (PAGES.md
 * §2 — schedule widget, latest message, requests zone) is built later.
 */
export function Home({ profile }: { profile: Profile }) {
  const firstName = profile.fullName.split(" ")[0];
  return (
    <div className="screen">
      <h1 className="title">Home</h1>
      <p className="greeting">Hello {firstName}</p>
      <p className="help">
        Signed in as {profile.role}
        {profile.teamLetter ? ` · Team ${profile.teamLetter}` : ""}
      </p>
      <button className="btn" type="button" onClick={() => logout()}>
        Log out
      </button>
    </div>
  );
}
