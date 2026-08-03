import type { Message } from "../messages";

/**
 * A single announcement, rendered as a reference card with the gold accent bar
 * (DESIGN.md component E): display title, Montserrat body, muted timestamp.
 * Shared by Home's latest-message box and the Previous Messages list.
 */
export function MessageCard({ message }: { message: Message }) {
  return (
    <article className="msg">
      <h3 className="msg-title">{message.title}</h3>
      <p className="msg-body">{message.body}</p>
      {message.sentAt && (
        <p className="msg-time">{formatTime(message.sentAt)}</p>
      )}
    </article>
  );
}

function formatTime(d: Date): string {
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
