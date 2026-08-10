import { useState } from "react";
import type { Profile } from "../auth";
import {
  submitRequest,
  savedPhone,
  QUEUE_META,
  type QueueId,
} from "../requests";

/**
 * Submit a Request (PAGES.md §9). The queue is fixed by the button tapped on
 * Home — never chosen here. Name comes from the profile; phone is remembered on
 * the device; room is prompted every time and may be blank.
 */
export function SubmitRequest({
  profile,
  queue,
  onBack,
}: {
  profile: Profile;
  queue: QueueId;
  onBack: () => void;
}) {
  const [description, setDescription] = useState("");
  const [room, setRoom] = useState("");
  const [phone, setPhone] = useState(savedPhone());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = phone.trim() !== "" && !busy;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await submitRequest({
        queue,
        requesterName: profile.fullName,
        phone,
        room,
        description,
      });
      onBack(); // back to Home; the My Requests strip now shows it with position
    } catch (e) {
      console.error("Submit request failed:", e);
      setError("Couldn't submit that — please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <button className="back" type="button" onClick={onBack}>
        ‹ Home
      </button>
      <h1 className="title">{QUEUE_META[queue].title}</h1>

      <div className="field">
        <span className="label">Anything we should know? (optional)</span>
        <textarea
          className="textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={280}
          placeholder="Short description"
        />
      </div>

      <div className="field">
        <span className="label">Room # (optional)</span>
        <input
          className="text-input"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          placeholder="e.g. 204"
          maxLength={40}
        />
      </div>

      <div className="field">
        <span className="label">Phone</span>
        <input
          className="text-input"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Your phone number"
          inputMode="tel"
          maxLength={30}
        />
      </div>

      {error && <p className="error">{error}</p>}

      <button
        className="btn-primary"
        type="button"
        disabled={!canSubmit}
        onClick={submit}
      >
        {busy ? "Submitting…" : "Submit"}
      </button>
    </div>
  );
}
