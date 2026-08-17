import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import { getCachedProfile, type Profile } from "./auth";
import type { QueueId } from "./requests";
import { Registration } from "./screens/Registration";
import { Home } from "./screens/Home";
import { PreviousMessages } from "./screens/PreviousMessages";
import { Compose } from "./screens/admin/Compose";
import { Tracking } from "./screens/admin/Tracking";
import { Scheduled } from "./screens/admin/Scheduled";
import { FullWeek } from "./screens/FullWeek";
import { SubmitRequest } from "./screens/SubmitRequest";
import { MyQueue } from "./screens/MyQueue";
import { RulesSearch } from "./screens/RulesSearch";
import { PdfViewer } from "./screens/PdfViewer";
import type { SourceDoc } from "./searchConfig";

// Minimal in-app navigation. One flat view state is enough for now; swap for a
// router if deep-linking or nested admin nav is ever needed.
export type View =
  | "home"
  | "previous"
  | "fullweek"
  | "submit"
  | "queue"
  | "rules"
  | "pdf"
  | "compose"
  | "tracking"
  | "scheduled";

function App() {
  // undefined = auth state not resolved yet (restoring a persisted session);
  // null = signed out; Profile = signed in.
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [view, setView] = useState<View>("home");
  // Which queue a "Submit a Request" screen is for (fixed by the tapped button).
  const [submitQueue, setSubmitQueue] = useState<QueueId | null>(null);
  // Which PDF the full-document viewer (§6) is showing.
  const [pdfDoc, setPdfDoc] = useState<SourceDoc>("rulebook");

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

  const goSubmit = (queue: QueueId) => {
    setSubmitQueue(queue);
    setView("submit");
  };

  if (view === "previous") {
    return <PreviousMessages onBack={() => setView("home")} />;
  }
  if (view === "fullweek") {
    return <FullWeek onBack={() => setView("home")} />;
  }
  if (view === "submit" && submitQueue) {
    return (
      <SubmitRequest
        profile={profile}
        queue={submitQueue}
        onBack={() => setView("home")}
      />
    );
  }
  if (view === "queue") {
    return <MyQueue profile={profile} onBack={() => setView("home")} />;
  }
  if (view === "rules") {
    return (
      <RulesSearch
        onBack={() => setView("home")}
        onOpenPdf={(doc) => {
          setPdfDoc(doc);
          setView("pdf");
        }}
      />
    );
  }
  if (view === "pdf") {
    return <PdfViewer doc={pdfDoc} onBack={() => setView("rules")} />;
  }
  // Admin pages are gated on the flag even though their entry points are hidden.
  if (view === "compose" && profile.isAdmin) {
    return <Compose onNavigate={setView} />;
  }
  if (view === "tracking" && profile.isAdmin) {
    return <Tracking onNavigate={setView} />;
  }
  if (view === "scheduled" && profile.isAdmin) {
    return <Scheduled onNavigate={setView} />;
  }
  return (
    <Home profile={profile} onNavigate={setView} onSubmitRequest={goSubmit} />
  );
}

export default App;
