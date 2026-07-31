import { useEffect, useMemo, useState } from "react";
import {
  NON_VOLUNTEER_ROLES,
  VOLUNTEER_ROLES,
  NOTIFICATION_TITLES,
  DIVISIONS,
  TEAM_LETTERS,
} from "../../constants";
import {
  loadSchools,
  sendNotification,
  type SchoolOption,
  type SendResult,
} from "../../notifications";

type Phase = "edit" | "confirm" | "sending" | "sent";

/**
 * Admin > Compose Notification (PAGES.md §7). Pick a preset title, write a body,
 * choose roles (the primary "who"), optionally narrow by division/letter/school,
 * confirm the plain-language audience, and send via the sendNotification
 * function. Only reachable behind the isAdmin gate on Home.
 */
export function Compose({ onBack }: { onBack: () => void }) {
  const [title, setTitle] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [silent, setSilent] = useState(false);
  const [divisions, setDivisions] = useState<number[]>([]);
  const [letters, setLetters] = useState<string[]>([]);
  const [school, setSchool] = useState<string>("");
  const [schools, setSchools] = useState<SchoolOption[]>([]);

  const [phase, setPhase] = useState<Phase>("edit");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);

  useEffect(() => {
    loadSchools()
      .then(setSchools)
      .catch(() => setSchools([]));
  }, []);

  const allVolunteers = VOLUNTEER_ROLES.every((r) => roles.includes(r));
  const canSend = title !== null && body.trim() !== "" && roles.length > 0;

  const summary = useMemo(
    () => audience(roles, divisions, letters, school, schools),
    [roles, divisions, letters, school, schools]
  );

  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value) ?
      list.filter((v) => v !== value) :
      [...list, value];
  }

  function toggleAllVolunteers() {
    setRoles((prev) =>
      allVolunteers ?
        prev.filter((r) => !VOLUNTEER_ROLES.includes(r as never)) :
        [...new Set([...prev, ...VOLUNTEER_ROLES])]
    );
  }

  function reset() {
    setTitle(null);
    setBody("");
    setRoles([]);
    setSilent(false);
    setDivisions([]);
    setLetters([]);
    setSchool("");
    setPhase("edit");
    setError(null);
    setResult(null);
  }

  async function confirmSend() {
    setPhase("sending");
    setError(null);
    try {
      const res = await sendNotification({
        title: title as string,
        body: body.trim(),
        silent,
        roles,
        divisions,
        teamLetters: letters,
        school: school || null,
      });
      setResult(res);
      setPhase("sent");
    } catch (err) {
      setError(messageFor(err));
      setPhase("edit");
    }
  }

  if (phase === "sent" && result) {
    return (
      <div className="screen">
        <button className="back" type="button" onClick={onBack}>
          ‹ Home
        </button>
        <h1 className="title">Sent</h1>
        <p className="greeting">
          Delivered to {result.recipientCount}{" "}
          {result.recipientCount === 1 ? "person" : "people"}
          {result.tokenCount > 0 ?
            ` · ${result.delivered}/${result.tokenCount} devices` :
            " · no devices registered yet"}
          {result.failed > 0 ? ` · ${result.failed} failed` : ""}.
        </p>
        <button className="btn-primary" type="button" onClick={reset}>
          Compose Another
        </button>
      </div>
    );
  }

  const sending = phase === "sending";

  return (
    <div className="screen">
      <button className="back" type="button" onClick={onBack}>
        ‹ Home
      </button>
      <h1 className="title">Compose a Notification</h1>

      {/* Title — required preset pick, full-width rows */}
      <div className="field">
        <span className="label">Title*</span>
        <div className="option-list">
          {NOTIFICATION_TITLES.map((t) => (
            <button
              key={t}
              type="button"
              className={"option-row" + (title === t ? " selected" : "")}
              onClick={() => setTitle(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="field">
        <span className="label">Body Text*</span>
        <textarea
          className="textarea"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="What do you want to say?"
        />
      </div>

      {/* Recipient roles — non-volunteer roles + All Volunteers on top,
          divider, then the 5 individual volunteer roles below. */}
      <div className="field">
        <span className="label">Recipient Groups*</span>
        <div className="recipients">
          <div className="chip-row">
            {NON_VOLUNTEER_ROLES.map((r) => (
              <button
                key={r}
                type="button"
                className={"chip" + (roles.includes(r) ? " selected" : "")}
                onClick={() => setRoles((prev) => toggle(prev, r))}
              >
                {r}
              </button>
            ))}
            <button
              type="button"
              className={"chip" + (allVolunteers ? " selected" : "")}
              onClick={toggleAllVolunteers}
            >
              All Volunteers
            </button>
          </div>
          <div className="divider" />
          <div className="chip-row">
            {VOLUNTEER_ROLES.map((r) => (
              <button
                key={r}
                type="button"
                className={"chip" + (roles.includes(r) ? " selected" : "")}
                onClick={() => setRoles((prev) => toggle(prev, r))}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Options — full-width rows */}
      <div className="field">
        <span className="label">Options</span>
        <div className="option-list">
          <button
            type="button"
            className={"option-row" + (silent ? " selected" : "")}
            onClick={() => setSilent((s) => !s)}
          >
            Silent
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {/* Send / Reset — same row, above the filters (PAGES.md §7) */}
      {phase === "confirm" ? (
        <div className="confirm">
          <p className="confirm-text">{summary}</p>
          {silent && <p className="meta">Sent silently (no sound).</p>}
          <div className="button-row">
            <button className="btn-primary" type="button" onClick={confirmSend}>
              Confirm Send
            </button>
            <button
              className="btn-reset"
              type="button"
              onClick={() => setPhase("edit")}
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="divider" />
          <div className="button-row">
            <button
              className="btn-primary"
              type="button"
              disabled={!canSend || sending}
              onClick={() => setPhase("confirm")}
            >
              {sending ? "Sending…" : "Send"}
            </button>
            <button className="btn-reset" type="button" onClick={reset}>
              Reset
            </button>
          </div>
        </>
      )}

      {/* Filters — narrow the selected roles */}
      <div className="filters">
        <h2 className="filters-header">Filters</h2>
        <p className="filters-sub">All teams will be targeted if left blank</p>

        <div className="filter-section">
          <span className="label">Division</span>
          <div className="chip-row chip-row--fill">
            {DIVISIONS.map((d) => (
              <button
                key={d}
                type="button"
                className={"chip" + (divisions.includes(d) ? " selected" : "")}
                onClick={() => setDivisions((prev) => toggle(prev, d))}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-section">
          <span className="label">Team Letter</span>
          <div className="chip-row chip-row--fill">
            {TEAM_LETTERS.map((l) => (
              <button
                key={l}
                type="button"
                className={"chip" + (letters.includes(l) ? " selected" : "")}
                onClick={() => setLetters((prev) => toggle(prev, l))}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-section">
          <span className="label">School</span>
          <div className="select-wrap">
            <select
              className="select"
              value={school}
              onChange={(e) => setSchool(e.target.value)}
            >
              <option value="">Any school</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <span className="select-caret">▾</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Plain-language description of who the send targets (PAGES.md §7 confirmation).
function audience(
  roles: string[],
  divisions: number[],
  letters: string[],
  school: string,
  schools: SchoolOption[]
): string {
  const roleStr = roles.join(", ");
  const parts: string[] = [];
  if (divisions.length) {
    parts.push("Division " + [...divisions].sort().join(", "));
  }
  if (letters.length) parts.push("Team " + [...letters].sort().join(", "));
  if (school) {
    parts.push(schools.find((s) => s.id === school)?.name ?? "one school");
  }
  const narrow = parts.length ? " in " + parts.join(", ") : "";
  return `This goes to ${roleStr}${narrow}.`;
}

function messageFor(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  const message = (err as { message?: string })?.message;
  if (
    code === "functions/failed-precondition" ||
    code === "functions/invalid-argument" ||
    code === "functions/permission-denied"
  ) {
    return message || "Couldn't send that.";
  }
  return "Something went wrong sending. Please try again.";
}
