import { useEffect, useMemo, useState, type ReactNode } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import { getCachedProfile, logout, type Profile } from "../auth";
import { ROLES } from "../constants";
import { Registration } from "./Registration";
import {
  FEED_LIMIT,
  fetchRoster,
  useActiveTickets,
  useDevices,
  useHeartbeat,
  usePendingSends,
  useProblems,
  usePushes,
  useSearches,
  useStats,
  type Roster,
  type RosterPerson,
} from "../ops";
import "../ops.css";

/**
 * /ops — the laptop monitoring dashboard (outside the phone shell). Admin-only:
 * the gate here is cosmetic, the real one is the rules + getOpsRoster's
 * assertAdmin. Data sources and their read costs: see app/src/ops.ts.
 */
export default function OpsRoot() {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  useEffect(
    () => onAuthStateChanged(auth, (u) => setProfile(u ? getCachedProfile() : null)),
    []
  );
  if (profile === undefined) return null;
  if (!profile) return <Registration />;
  if (!profile.isAdmin) {
    return (
      <div className="ops">
        <h1>Ops</h1>
        <p>{profile.fullName} isn't an admin.</p>
        <button className="ops-btn" onClick={() => logout()}>Log out</button>
      </div>
    );
  }
  return <Ops profile={profile} />;
}

// --- thresholds -------------------------------------------------------------

const MIN = 60_000;
const HEARTBEAT_STALE = 10 * MIN; // heartbeat is written every 5 min
const OPEN_WAIT_WARN = 10 * MIN; // unclaimed ticket
const CLAIM_HELD_WARN = 30 * MIN; // claim with no resolve
const RECENT = 60 * MIN; // "in the last hour" for error/failure alerts
const SEND_OVERDUE = 3 * MIN; // scheduled send past due and still pending

const QUEUES = [
  { id: "academic", label: "Academic (rules)", works: (p: RosterPerson) => p.managesAcademicQueue },
  { id: "tech", label: "Tech", works: (p: RosterPerson) => p.role === "Tech Volunteer" },
  { id: "runner", label: "Runner", works: (p: RosterPerson) => p.role === "Runner" },
];

// --- formatting -------------------------------------------------------------

function ago(d: Date | number | null | undefined, now: number): string {
  if (d == null) return "—";
  const ms = now - (typeof d === "number" ? d : d.getTime());
  if (ms < MIN) return "just now";
  const m = Math.floor(ms / MIN);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  return `${Math.floor(h / 24)}d ${h % 24}h ago`;
}

const dur = (ms: number) => ago(0, ms).replace(" ago", "");

const clock = (d: Date | null) =>
  d ? d.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "—";

const usd = (n: number, dp = 4) => `$${n.toFixed(dp)}`;
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

function useNow(everyMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

// --- layout pieces ----------------------------------------------------------

function Section(props: { title: string; note?: string; error?: string | null; children: ReactNode }) {
  return (
    <section className="ops-section">
      <h2>
        {props.title}
        {props.note && <span className="ops-note">{props.note}</span>}
      </h2>
      {props.error && <div className="ops-warn">{props.error}</div>}
      {props.children}
    </section>
  );
}

function Tile(props: { label: string; value: ReactNode; sub?: ReactNode; tone?: "bad" | "warn" }) {
  return (
    <div className={"ops-tile" + (props.tone ? ` ops-${props.tone}` : "")}>
      <div className="ops-tile-label">{props.label}</div>
      <div className="ops-tile-value">{props.value}</div>
      {props.sub && <div className="ops-tile-sub">{props.sub}</div>}
    </div>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="ops-empty">{children}</p>;

// --- the dashboard ----------------------------------------------------------

function Ops({ profile }: { profile: Profile }) {
  const now = useNow();
  const [roster, setRoster] = useState<Roster | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [rosterTick, setRosterTick] = useState(0);

  // One-shot, not live: ~1k reads per load (SCHEMA.md §5), so only on mount
  // and on the Refresh button.
  useEffect(() => {
    let current = true;
    fetchRoster()
      .then((r) => {
        if (!current) return;
        setRoster(r);
        setRosterError(null);
      })
      .catch((e) => current && setRosterError(`Roster failed to load: ${(e as Error).message}`))
      .finally(() => current && setLoadingRoster(false));
    return () => {
      current = false;
    };
  }, [rosterTick]);
  const loadRoster = () => {
    setLoadingRoster(true);
    setRosterTick((n) => n + 1);
  };

  const devices = useDevices();
  const stats = useStats();
  const heartbeat = useHeartbeat();
  const searches = useSearches();
  const pushes = usePushes();
  const problems = useProblems();
  const tickets = useActiveTickets();
  const pending = usePendingSends();

  const byId = useMemo(
    () => new Map((roster?.people ?? []).map((p) => [p.id, p])),
    [roster]
  );
  const name = (id: string) => byId.get(id)?.fullName ?? id;
  const withDevice = useMemo(
    () => new Set((devices.data ?? []).map((d) => d.personId)),
    [devices.data]
  );

  const s = stats.data ?? {};
  const people = roster?.people ?? [];
  const reachable = people.filter((p) => withDevice.has(p.id)).length;
  const neverOpened = people.filter((p) => p.lastOpenedAt == null);
  const noDevice = people.filter((p) => !withDevice.has(p.id));
  const deviceList = [...(devices.data ?? [])].sort(
    (a, b) => (b.lastSeen?.getTime() ?? 0) - (a.lastSeen?.getTime() ?? 0)
  );
  const seenWithin = (ms: number) =>
    deviceList.filter((d) => d.lastSeen && now - d.lastSeen.getTime() < ms).length;

  const hbAge = heartbeat.data ? now - heartbeat.data.getTime() : null;
  const schedulerOk = hbAge !== null && hbAge < HEARTBEAT_STALE;

  // --- alerts ---------------------------------------------------------------
  const alerts: { tone: "bad" | "warn"; text: string }[] = [];
  if (heartbeat.data !== undefined && !schedulerOk) {
    alerts.push({
      tone: "bad",
      text: heartbeat.data
        ? `Scheduler last ran ${ago(heartbeat.data, now)} — scheduled sends won't fire.`
        : "No scheduler heartbeat recorded yet.",
    });
  }
  for (const p of pending.data ?? []) {
    if (p.sendAt && now - p.sendAt.getTime() > SEND_OVERDUE) {
      alerts.push({ tone: "bad", text: `Scheduled "${p.title}" was due ${ago(p.sendAt, now)} and hasn't fired.` });
    }
  }
  if (roster) {
    for (const q of QUEUES) {
      const workers = people.filter(q.works);
      const reach = workers.filter((w) => withDevice.has(w.id));
      if (workers.length === 0) {
        alerts.push({ tone: "bad", text: `${q.label} queue has no workers in the roster.` });
      } else if (reach.length === 0) {
        alerts.push({ tone: "bad", text: `No ${q.label} worker has push enabled — new requests notify nobody.` });
      }
    }
  }
  for (const t of tickets.data ?? []) {
    if (t.status === "open" && t.createdAt && now - t.createdAt.getTime() > OPEN_WAIT_WARN) {
      alerts.push({ tone: "warn", text: `${t.queue} ticket from ${t.requesterName} unclaimed for ${dur(now - t.createdAt.getTime())}.` });
    }
    if (t.status === "claimed" && t.claimedAt && now - t.claimedAt.getTime() > CLAIM_HELD_WARN) {
      alerts.push({ tone: "warn", text: `${t.queue} ticket from ${t.requesterName} held by ${t.claimedByName ?? "?"} for ${dur(now - t.claimedAt.getTime())}.` });
    }
  }
  const recentErrors = (problems.data ?? []).filter(
    (p) => p.level === "error" && p.at && now - p.at.getTime() < RECENT
  ).length;
  if (recentErrors) alerts.push({ tone: "bad", text: `${recentErrors} error(s) in the last hour — see Problems.` });
  const recentFailed = (pushes.data ?? [])
    .filter((p) => p.at && now - p.at.getTime() < RECENT)
    .reduce((n, p) => n + p.failed, 0);
  if (recentFailed) alerts.push({ tone: "warn", text: `${recentFailed} push delivery failure(s) in the last hour.` });

  const searchesN = s.searches ?? 0;
  const cost = s.searchCost ?? 0;

  return (
    <div className="ops">
      <header className="ops-header">
        <h1>JMUCC Ops</h1>
        <div className="ops-header-meta">
          <span>
            Roster loaded {roster ? ago(roster.loadedAt, now) : "—"}{" "}
            <button className="ops-btn" onClick={loadRoster} disabled={loadingRoster}>
              {loadingRoster ? "Loading…" : "Refresh roster"}
            </button>
          </span>
          <span>
            {profile.fullName} ·{" "}
            <button className="ops-link" onClick={() => logout()}>Log out</button>
          </span>
        </div>
      </header>
      {rosterError && <div className="ops-warn">{rosterError}</div>}

      <div className="ops-alerts">
        {alerts.length === 0 ? (
          <div className="ops-alert ops-ok">All clear.</div>
        ) : (
          alerts.map((a, i) => (
            <div key={i} className={`ops-alert ops-${a.tone}`}>{a.text}</div>
          ))
        )}
      </div>

      <div className="ops-tiles">
        <Tile
          label="Devices registered"
          value={devices.data?.length ?? "…"}
          sub={`${seenWithin(60 * MIN)} seen in 1h · ${seenWithin(24 * 60 * MIN)} in 24h`}
        />
        <Tile
          label="People reachable by push"
          value={roster ? `${reachable} / ${people.length}` : "…"}
          sub={roster ? `${pct(reachable, people.length)} · ${neverOpened.length} never opened app` : undefined}
          tone={roster && people.length > 0 && reachable / people.length < 0.6 ? "warn" : undefined}
        />
        <Tile
          label="Searches (total)"
          value={searchesN}
          sub={`${s.searchesEmpty ?? 0} no answer · ${s.searchesFailed ?? 0} failed · ${s.searchesFallback ?? 0} fallback`}
          tone={s.searchesFailed ? "warn" : undefined}
        />
        <Tile
          label="Search cost (total)"
          value={usd(cost, 2)}
          sub={`${searchesN ? usd(cost / searchesN) : "—"} / search · cache hit ${pct(s.searchCachedTokens ?? 0, s.searchPromptTokens ?? 0)}`}
        />
        <Tile
          label="Push deliveries (total)"
          value={`${s.pushDelivered ?? 0} / ${s.pushTokens ?? 0}`}
          sub={`${s.pushFailed ?? 0} failed · ${s.pushes ?? 0} sends`}
          tone={s.pushFailed ? "warn" : undefined}
        />
        <Tile
          label="Problems (total)"
          value={`${s.errors ?? 0} err · ${s.warnings ?? 0} warn`}
          tone={s.errors ? "bad" : undefined}
        />
        <Tile
          label="Scheduler"
          value={heartbeat.data === undefined ? "…" : schedulerOk ? "Running" : "STOPPED"}
          sub={`heartbeat ${ago(heartbeat.data ?? null, now)} · ${pending.data?.length ?? 0} pending`}
          tone={heartbeat.data !== undefined && !schedulerOk ? "bad" : undefined}
        />
      </div>

      <div className="ops-grid">
        <Section title="Queue health" note="live" error={tickets.error}>
          <table className="ops-table">
            <thead>
              <tr><th>Queue</th><th>Open</th><th>Claimed</th><th>Oldest open</th><th>Workers</th><th>Workers w/ push</th></tr>
            </thead>
            <tbody>
              {QUEUES.map((q) => {
                const mine = (tickets.data ?? []).filter((t) => t.queue === q.id);
                const open = mine.filter((t) => t.status === "open");
                const oldest = open[0]?.createdAt;
                const workers = people.filter(q.works);
                const reach = workers.filter((w) => withDevice.has(w.id)).length;
                return (
                  <tr key={q.id}>
                    <td>{q.label}</td>
                    <td>{open.length}</td>
                    <td>{mine.length - open.length}</td>
                    <td>{oldest ? dur(now - oldest.getTime()) : "—"}</td>
                    <td>{roster ? workers.length : "…"}</td>
                    <td className={roster && reach === 0 ? "ops-bad-text" : ""}>{roster ? reach : "…"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(tickets.data ?? []).length > 0 && (
            <table className="ops-table">
              <thead>
                <tr><th>Queue</th><th>Requester</th><th>Status</th><th>Waiting</th><th>Held by</th></tr>
              </thead>
              <tbody>
                {(tickets.data ?? []).map((t) => (
                  <tr key={t.id}>
                    <td>{t.queue}</td>
                    <td>{t.requesterName}</td>
                    <td>{t.status}</td>
                    <td>{t.createdAt ? dur(now - t.createdAt.getTime()) : "—"}</td>
                    <td>{t.claimedByName ? `${t.claimedByName} (${ago(t.claimedAt, now)})` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title="Scheduled sends" note="live" error={pending.error ?? heartbeat.error}>
          {(pending.data ?? []).length === 0 ? (
            <Empty>Nothing scheduled.</Empty>
          ) : (
            <table className="ops-table">
              <thead><tr><th>Sends</th><th>Title</th><th>To</th><th>Body</th></tr></thead>
              <tbody>
                {(pending.data ?? []).map((p) => (
                  <tr key={p.id}>
                    <td>{clock(p.sendAt)}</td>
                    <td>{p.title}</td>
                    <td>{p.roles.join(", ")}</td>
                    <td className="ops-wrap">{p.body}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>

      <Section title="Reachability by role" note="roster: on load / refresh · devices: live">
        {!roster ? (
          <Empty>Loading roster…</Empty>
        ) : (
          <>
            <table className="ops-table">
              <thead>
                <tr><th>Role</th><th>People</th><th>With push</th><th>No push</th><th>Never opened app</th></tr>
              </thead>
              <tbody>
                {ROLES.map((role) => {
                  const rp = people.filter((p) => p.role === role);
                  if (rp.length === 0) return null;
                  const yes = rp.filter((p) => withDevice.has(p.id)).length;
                  const never = rp.filter((p) => p.lastOpenedAt == null).length;
                  return (
                    <tr key={role}>
                      <td>{role}</td>
                      <td>{rp.length}</td>
                      <td>{yes} <span className="ops-muted">({pct(yes, rp.length)})</span></td>
                      <td>{rp.length - yes}</td>
                      <td>{never}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <PeopleList title="No push registration" people={noDevice} now={now} />
            <PeopleList title="Never opened the app" people={neverOpened} now={now} />
          </>
        )}
      </Section>

      <Section title="Devices" note={`live · ${deviceList.length}`} error={devices.error}>
        {deviceList.length === 0 ? (
          <Empty>No registered devices.</Empty>
        ) : (
          <div className="ops-scroll">
            <table className="ops-table">
              <thead><tr><th>Person</th><th>Role</th><th>Last seen</th><th>Device id</th></tr></thead>
              <tbody>
                {deviceList.map((d) => (
                  <tr key={d.id}>
                    <td>
                      {name(d.personId)}
                      {roster && !byId.has(d.personId) && <span className="ops-muted"> (not in roster)</span>}
                    </td>
                    <td>{byId.get(d.personId)?.role ?? "—"}</td>
                    <td title={d.lastSeen?.toLocaleString()}>{ago(d.lastSeen, now)}</td>
                    <td className="ops-muted ops-mono">{d.id.slice(0, 8)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Rulebook searches" note={`live · latest ${FEED_LIMIT}`} error={searches.error}>
        {(searches.data ?? []).length === 0 ? (
          <Empty>No searches yet.</Empty>
        ) : (
          <div className="ops-scroll">
            <table className="ops-table">
              <thead>
                <tr><th>When</th><th>Who</th><th>Question</th><th>Result</th><th>Model</th><th>Tokens in / cached / out</th><th>Cost</th><th>Time</th></tr>
              </thead>
              <tbody>
                {(searches.data ?? []).map((e) => (
                  <tr key={e.id}>
                    <td title={e.at?.toLocaleString()}>{clock(e.at)}</td>
                    <td>{name(e.personId)}</td>
                    <td className="ops-wrap">{e.query}</td>
                    <td className={!e.ok ? "ops-bad-text" : e.citations === 0 ? "ops-warn-text" : ""}>
                      {!e.ok ? "FAILED" : e.citations === 0 ? "no answer" : `${e.citations} cited`}
                      {e.dropped > 0 && <span className="ops-muted"> ({e.dropped} dropped)</span>}
                    </td>
                    <td>
                      {e.model?.split("/").pop() ?? "—"}
                      {e.fallback && <span className="ops-warn-text"> fallback</span>}
                    </td>
                    <td className="ops-mono">
                      {e.promptTokens} / {pct(e.cachedTokens, e.promptTokens)} / {e.completionTokens}
                    </td>
                    <td className="ops-mono">{e.cost == null ? "—" : usd(e.cost)}</td>
                    <td className="ops-mono">{(e.durationMs / 1000).toFixed(1)}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Push deliveries" note={`live · latest ${FEED_LIMIT} · "delivered" = accepted by FCM`} error={pushes.error}>
        {(pushes.data ?? []).length === 0 ? (
          <Empty>No pushes yet.</Empty>
        ) : (
          <div className="ops-scroll">
            <table className="ops-table">
              <thead>
                <tr><th>When</th><th>Kind</th><th>People</th><th>No device</th><th>Devices</th><th>Delivered</th><th>Failed</th><th>Pruned</th><th>Error codes</th></tr>
              </thead>
              <tbody>
                {(pushes.data ?? []).map((p) => (
                  <tr key={p.id}>
                    <td title={p.at?.toLocaleString()}>{clock(p.at)}</td>
                    <td>{p.kind}</td>
                    <td>{p.recipients}</td>
                    <td className={p.recipientsWithoutDevice ? "ops-warn-text" : ""}>{p.recipientsWithoutDevice}</td>
                    <td>{p.tokens}</td>
                    <td>{p.delivered}</td>
                    <td className={p.failed ? "ops-bad-text" : ""}>{p.failed}</td>
                    <td>{p.pruned}</td>
                    <td className="ops-mono ops-wrap">
                      {Object.entries(p.errorCodes).map(([k, v]) => `${k} ×${v}`).join(", ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Problems" note={`live · latest ${FEED_LIMIT}`} error={problems.error}>
        {(problems.data ?? []).length === 0 ? (
          <Empty>No problems recorded.</Empty>
        ) : (
          <div className="ops-scroll">
            <table className="ops-table">
              <thead><tr><th>When</th><th>Level</th><th>Source</th><th>Who</th><th>Message</th><th>Detail</th></tr></thead>
              <tbody>
                {(problems.data ?? []).map((p) => {
                  const who = typeof p.context.personId === "string" ? name(p.context.personId) : "—";
                  return (
                    <tr key={p.id}>
                      <td title={p.at?.toLocaleString()}>{clock(p.at)}</td>
                      <td className={p.level === "error" ? "ops-bad-text" : "ops-warn-text"}>{p.level}</td>
                      <td>{p.source}</td>
                      <td>{who}</td>
                      <td className="ops-wrap">{p.message}</td>
                      <td>
                        <details>
                          <summary>context</summary>
                          <pre className="ops-pre">{JSON.stringify(p.context, null, 2)}</pre>
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

function PeopleList(props: { title: string; people: RosterPerson[]; now: number }) {
  const sorted = [...props.people].sort(
    (a, b) => a.role.localeCompare(b.role) || a.fullName.localeCompare(b.fullName)
  );
  return (
    <details className="ops-details">
      <summary>{props.title} ({sorted.length})</summary>
      {sorted.length === 0 ? (
        <Empty>Nobody.</Empty>
      ) : (
        <table className="ops-table">
          <thead><tr><th>Name</th><th>Role</th><th>Last opened</th></tr></thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id}>
                <td>{p.fullName}</td>
                <td>{p.role}</td>
                <td>{ago(p.lastOpenedAt, props.now)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </details>
  );
}
