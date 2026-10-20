import { useCallback, useRef, useState } from "react";
import { notifyIncoming, useLivePoll } from "@/lib/use-live-poll";

export type ChatMessage = {
  id: number;
  author_role: string;
  author_name: string;
  body: string;
  created_at: string;
};

export type ChatPollResult = {
  status: string;
  messages: ChatMessage[];
  typing: boolean;
  seenAt: string | null;
};

/**
 * Live ticket chat state shared by the customer and admin pages. Polls for messages newer
 * than the last one received (cursor = message id), tracks the other side's typing / seen
 * state and lets the page append its own sent message instantly.
 */
export function useTicketChat(opts: {
  initialMessages: ChatMessage[];
  initialStatus: string;
  theirRole: "admin" | "customer";
  poll: (args: { after: number; typing: boolean; visible: boolean }) => Promise<ChatPollResult | null>;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(opts.initialMessages);
  const [status, setStatus] = useState(opts.initialStatus);
  const [theirTyping, setTheirTyping] = useState(false);
  const [theirSeenAt, setTheirSeenAt] = useState<string | null>(null);
  // The cursor only moves with poll results, so a message sent by this side can never make
  // the poll skip one that arrived in the meantime (duplicates are merged by id).
  const cursor = useRef(opts.initialMessages.reduce((max, m) => Math.max(max, m.id), 0));
  const typingUntil = useRef(0);
  const pollRef = useRef(opts.poll);
  pollRef.current = opts.poll;

  const append = useCallback((incoming: ChatMessage[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const known = new Set(prev.map((m) => m.id));
      const fresh = incoming.filter((m) => !known.has(m.id));
      if (fresh.length === 0) return prev;
      return [...prev, ...fresh].sort((a, b) => a.id - b.id);
    });
  }, []);

  const { pollNow } = useLivePoll(async () => {
    const result = await pollRef.current({
      after: cursor.current,
      typing: Date.now() < typingUntil.current,
      visible: document.visibilityState === "visible",
    });
    if (!result) return;
    setStatus(result.status);
    setTheirTyping(result.typing);
    setTheirSeenAt(result.seenAt);
    if (result.messages.length > 0) {
      cursor.current = result.messages.reduce((max, m) => Math.max(max, m.id), cursor.current);
      append(result.messages);
      const theirs = result.messages.filter((m) => m.author_role === opts.theirRole);
      if (theirs.length > 0) {
        setTheirTyping(false);
        notifyIncoming(theirs.length);
      }
    }
  });

  /** Call on every keystroke: flags "typing" for the next few seconds. */
  const markTyping = useCallback(() => {
    const wasTyping = Date.now() < typingUntil.current;
    typingUntil.current = Date.now() + 3000;
    if (!wasTyping) pollNow();
  }, [pollNow]);

  const stopTyping = useCallback(() => {
    typingUntil.current = 0;
  }, []);

  return { messages, status, setStatus, theirTyping, theirSeenAt, append, markTyping, stopTyping, pollNow };
}
