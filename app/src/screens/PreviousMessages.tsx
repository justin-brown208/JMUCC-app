import { useEffect, useState } from "react";
import { loadMessages, type Message } from "../messages";
import { MessageCard } from "../components/MessageCard";

/**
 * Previous Messages (PAGES.md §3) — the full history of announcements this
 * person has received, newest first, each shown in full inline.
 */
export function PreviousMessages({ onBack }: { onBack: () => void }) {
  const [messages, setMessages] = useState<Message[] | undefined>(undefined);

  useEffect(() => {
    loadMessages()
      .then(setMessages)
      .catch((e) => {
        console.error("Failed to load messages:", e);
        setMessages([]);
      });
  }, []);

  return (
    <div className="screen">
      <button className="back" type="button" onClick={onBack}>
        ‹ Home
      </button>
      <h1 className="title">Previous Messages</h1>

      {messages === undefined ? (
        <p className="help">Loading…</p>
      ) : messages.length === 0 ? (
        <p className="help">No messages yet.</p>
      ) : (
        <div className="msg-list">
          {messages.map((m) => (
            <MessageCard key={m.id} message={m} />
          ))}
        </div>
      )}
    </div>
  );
}
