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
import { Requests } from "./screens/Requests";
import { RulesSearch } from "./screens/RulesSearch";
import { PdfViewer } from "./screens/PdfViewer";
import { BottomNav, type TabId } from "./components/BottomNav";
import { NotificationGate } from "./components/NotificationGate";
import type { SourceDoc } from "./searchConfig";

// A View is a concrete screen. Several views belong to one bottom-bar tab (e.g.
// the submit form and My Queue both live under the Requests tab); VIEW_TAB maps
// each view to the tab that should read active, and TAB_ROOT the reverse — the
// screen a tab lands on when tapped.
export type View =
  | "home"
  | "fullweek"
  | "rules"
  | "pdf"
  | "messages"
  | "requests"
  | "submit"
  | "compose"
  | "scheduled"
  | "tracking";

const VIEW_TAB: Record<View, TabId> = {
  home: "home",
  fullweek: "home",
  rules: "rules",
  pdf: "rules",
  messages: "messages",
  requests: "requests",
  submit: "requests",
  compose: "admin",
  scheduled: "admin",
  tracking: "admin",
};

const TAB_ROOT: Record<TabId, View> = {
  home: "home",
  rules: "rules",
  messages: "messages",
  requests: "requests",
  admin: "compose",
};

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

  const screen = renderView();

  function renderView() {
    switch (view) {
      case "fullweek":
        return <FullWeek onBack={() => setView("home")} />;
      case "rules":
        return (
          <RulesSearch
            onOpenPdf={(doc) => {
              setPdfDoc(doc);
              setView("pdf");
            }}
          />
        );
      case "pdf":
        return <PdfViewer doc={pdfDoc} onBack={() => setView("rules")} />;
      case "messages":
        return <PreviousMessages />;
      case "requests":
        return <Requests profile={profile!} onOpenSubmit={goSubmit} />;
      case "submit":
        return submitQueue ? (
          <SubmitRequest
            profile={profile!}
            queue={submitQueue}
            onBack={() => setView("requests")}
          />
        ) : (
          <Requests profile={profile!} onOpenSubmit={goSubmit} />
        );
      // Admin pages are gated on the flag even though their tab is hidden.
      case "compose":
        return profile!.isAdmin ? <Compose onNavigate={setView} /> : home();
      case "tracking":
        return profile!.isAdmin ? <Tracking onNavigate={setView} /> : home();
      case "scheduled":
        return profile!.isAdmin ? <Scheduled onNavigate={setView} /> : home();
      default:
        return home();
    }
  }

  function home() {
    return <Home profile={profile!} onOpenFullWeek={() => setView("fullweek")} />;
  }

  // Full-bleed screens (the schedule poster) drop the nav's fade scrim so it
  // can't darken their artwork; everything else keeps it.
  const immersive = view === "fullweek";

  return (
    <div className={"app-shell has-nav" + (immersive ? " immersive" : "")}>
      {screen}
      <BottomNav
        profile={profile}
        active={VIEW_TAB[view]}
        onSelect={(tab) => setView(TAB_ROOT[tab])}
      />
      <NotificationGate />
    </div>
  );
}

export default App;
