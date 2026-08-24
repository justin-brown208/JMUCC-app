import type { Profile } from "../auth";
import { MyRequests } from "../components/MyRequests";
import { QueuePanel } from "../components/QueuePanel";
import {
  submittableQueues,
  workedQueue,
  QUEUE_META,
  type QueueId,
} from "../requests";

/**
 * Requests tab — the combined help-desk hub (PAGES.md §9–10).
 *
 *  - A queue worker's main job is their queue, so it's the primary content:
 *    the live tickets render inline. Their own requests + a small "need help
 *    yourself?" submit sit below.
 *  - A pure submitter (e.g. a Coach) just gets submit buttons + their tickets.
 */
export function Requests({
  profile,
  onOpenSubmit,
}: {
  profile: Profile;
  onOpenSubmit: (queue: QueueId) => void;
}) {
  const canSubmit = submittableQueues(profile);
  const worksQueue = workedQueue(profile);

  if (worksQueue) {
    return (
      <div className="screen">
        <h1 className="title">{QUEUE_META[worksQueue].workerTitle}</h1>
        <QueuePanel queue={worksQueue} />

        <MyRequests />

        {canSubmit.length > 0 && (
          <div className="field">
            <span className="label">Need help yourself?</span>
            <div className="submit-mini">
              {canSubmit.map((q) => (
                <button
                  key={q}
                  className="btn-small"
                  type="button"
                  onClick={() => onOpenSubmit(q)}
                >
                  {QUEUE_META[q].submitLabel}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Pure submitter (no queue worked).
  return (
    <div className="screen">
      <h1 className="title">Requests</h1>

      <MyRequests />

      {canSubmit.length > 0 && (
        <div className="field">
          <span className="label">Raise a request</span>
          {canSubmit.map((q) => (
            <button
              key={q}
              className="btn"
              type="button"
              onClick={() => onOpenSubmit(q)}
            >
              {QUEUE_META[q].submitLabel}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
