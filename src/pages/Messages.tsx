import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Flag, Lock, MessageCircle, Send, Trash2 } from "lucide-react";
import type { Conversation, DirectMessage } from "../types";
import { messagesPath, navigate, profilePath } from "../lib/router";
import { useAuth } from "../lib/store";
import { fmtTimeAgo } from "../lib/format";
import * as api from "../lib/api";
import { Panel, SectionTitle } from "../components/ui";
import { Avatar } from "../components/social";
import { ModerationMenu, ReportModal, type ModerationTarget } from "../components/moderation";
import { PeopleSearchSkeleton } from "../components/skeletons";

// ──────────────────────────────────────────────────────────────
// Direct messages.
//   #/messages            → conversation list
//   #/messages/:username  → one thread
// Delivery is live (Supabase realtime, RLS-scoped); who-can-DM-whom is decided
// server-side by can_dm (accepted follow either direction, no block) — the
// client only mirrors that decision for UX.
// ──────────────────────────────────────────────────────────────

export function Messages({ username }: { username?: string }) {
  return username ? <Thread username={username} /> : <ConversationList />;
}

// ════════════════════════════════════════════════════════════════
// Conversation list
// ════════════════════════════════════════════════════════════════

function ConversationList() {
  const { user } = useAuth();
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    api
      .listConversations()
      .then(setConvs)
      .catch(() => setConvs([]))
      .finally(() => setLoading(false));
  }, []);
  useEffect(reload, [reload]);

  // New incoming messages bump/refresh the list live.
  useEffect(() => {
    if (!user) return;
    return api.subscribeToIncomingDms(user.id, reload);
  }, [user, reload]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <SectionTitle kicker="Direct messages" title="Messages" />
      {loading ? (
        <PeopleSearchSkeleton count={4} />
      ) : convs.length === 0 ? (
        <Panel className="px-6 py-16 text-center text-fg-muted">
          <div className="mb-3 flex justify-center"><MessageCircle className="h-12 w-12" aria-hidden /></div>
          <p className="font-display text-lg font-black text-fg">No messages yet</p>
          <p className="mt-1 text-sm">
            Open a friend's profile and hit <span className="font-semibold text-gold">Message</span> — you can DM
            anyone you follow or who follows you.
          </p>
        </Panel>
      ) : (
        <div className="space-y-2 stagger-children">
          {convs.map((c) => (
            <Panel key={c.otherId} className="transition hover:border-gold/30">
              <button
                onClick={() => navigate(messagesPath(c.username))}
                className="flex w-full items-center gap-3 p-3 text-left"
              >
                <Avatar profile={{ username: c.username, displayName: c.displayName, avatarUrl: c.avatarUrl }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-display font-black text-fg">{c.displayName}</span>
                    <span className="shrink-0 text-xs text-fg-faint">{fmtTimeAgo(c.lastAt)}</span>
                  </div>
                  <div className={`truncate text-sm ${c.unreadCount > 0 ? "font-semibold text-fg" : "text-fg-muted"}`}>
                    {c.lastSenderId !== c.otherId && <span className="text-fg-faint">You: </span>}
                    {c.lastBody}
                  </div>
                </div>
                {c.unreadCount > 0 && (
                  <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-dean px-1.5 text-[11px] font-bold text-on-dean">
                    {c.unreadCount}
                  </span>
                )}
              </button>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// One thread
// ════════════════════════════════════════════════════════════════

function Thread({ username }: { username: string }) {
  const { user } = useAuth();
  const [other, setOther] = useState<(ModerationTarget & { avatarUrl: string | null }) | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [allowed, setAllowed] = useState<boolean | null>(null); // null = checking
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [reporting, setReporting] = useState<DirectMessage | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Resolve the counterparty (works for private profiles via the header RPC),
  // then load eligibility + history.
  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const header = await api.fetchProfileHeader(username);
      if (!active) return;
      if (!header || header.id === user.id) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setOther({ id: header.id, username: header.username, displayName: header.displayName, avatarUrl: header.avatarUrl });
      const [can, history] = await Promise.all([
        api.canDirectMessage(user.id, header.id),
        api.fetchThread(user.id, header.id),
      ]);
      if (!active) return;
      setAllowed(can);
      setMessages(history);
      setLoading(false);
      if (history.some((m) => m.recipientId === user.id && !m.readAt)) {
        void api.markThreadRead(user.id, header.id);
      }
    })();
    return () => {
      active = false;
    };
  }, [user, username]);

  // Live delivery: append messages from this counterparty and mark them read
  // immediately (the thread is on screen). Other senders are ignored here —
  // the nav badge picks those up.
  useEffect(() => {
    if (!user || !other) return;
    return api.subscribeToIncomingDms(user.id, (m) => {
      if (m.senderId !== other.id) return;
      setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
      void api.markThreadRead(user.id, other.id);
    });
  }, [user, other]);

  // Keep the latest message in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, loading]);

  const send = async () => {
    const body = draft.trim();
    if (!user || !other || !body) return;
    setDraft("");
    setSendError(null);
    try {
      const sent = await api.sendDirectMessage(user.id, other.id, body);
      setMessages((list) => [...list, sent]);
    } catch {
      // RLS refusal (they blocked you / connection severed) or a network blip.
      setDraft(body); // give the text back
      setSendError("Couldn't send. You may no longer be able to message this person.");
    }
  };

  const unsend = async (id: string) => {
    setMessages((list) => list.filter((m) => m.id !== id));
    try {
      await api.unsendDirectMessage(id);
    } catch (e) {
      console.error("unsend failed", e);
    }
  };

  if (notFound) {
    return (
      <Panel className="mx-auto max-w-md px-6 py-16 text-center text-fg-muted">
        No one to message at <span className="text-gold">@{username}</span>.
      </Panel>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col" style={{ minHeight: "60vh" }}>
      {/* Header */}
      <Panel className="mb-4 flex items-center gap-3 p-3">
        <button
          onClick={() => navigate("/messages")}
          aria-label="Back to all messages"
          className="rounded-lg p-1.5 text-fg-muted hover:bg-fg/5 hover:text-fg"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </button>
        {other ? (
          <>
            <button
              onClick={() => navigate(profilePath(other.username))}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              <Avatar profile={other} size={36} />
              <div className="min-w-0">
                <div className="truncate font-display font-black text-fg">{other.displayName}</div>
                <div className="truncate text-xs text-fg-faint">@{other.username}</div>
              </div>
            </button>
            <ModerationMenu target={other} onBlockChanged={(blocked) => blocked && setAllowed(false)} />
          </>
        ) : (
          <div className="flex-1" />
        )}
      </Panel>

      {/* Messages */}
      <div className="flex-1 space-y-2">
        {loading ? (
          <PeopleSearchSkeleton count={3} />
        ) : messages.length === 0 ? (
          <p className="py-12 text-center text-sm text-fg-faint">
            This is the very beginning of your conversation{other ? ` with ${other.displayName}` : ""}.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === user?.id;
            return (
              <div key={m.id} className={`group flex items-center gap-1.5 ${mine ? "justify-end" : "justify-start"}`}>
                {mine && (
                  <button
                    onClick={() => unsend(m.id)}
                    aria-label="Unsend message"
                    title="Unsend"
                    className="rounded p-1 text-fg-faint opacity-0 transition hover:text-dean focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
                <div
                  className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm ${
                    mine
                      ? "rounded-br-md border border-gold/30 bg-gold/15 text-fg"
                      : "rounded-bl-md border border-edge bg-panel-2 text-fg"
                  }`}
                  title={new Date(m.createdAt).toLocaleString()}
                >
                  {m.body}
                  <span className="ml-2 align-baseline text-[10px] text-fg-faint">{fmtTimeAgo(m.createdAt)}</span>
                </div>
                {!mine && other && (
                  <button
                    onClick={() => setReporting(m)}
                    aria-label="Report message"
                    title="Report"
                    className="rounded p-1 text-fg-faint opacity-0 transition hover:text-dean focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Flag className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className="sticky bottom-0 mt-4 bg-ink/85 pb-2 pt-2 backdrop-blur-md">
        {allowed === false ? (
          <Panel className="flex items-center gap-2 p-3 text-sm text-fg-muted">
            <Lock className="h-4 w-4 shrink-0" aria-hidden />
            You can't message {other?.displayName ?? "this person"} — messaging is open between people who
            follow each other (and not across a block).
          </Panel>
        ) : (
          <>
            {sendError && <p className="mb-2 text-sm font-semibold text-dean">{sendError}</p>}
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={Math.min(4, Math.max(1, draft.split("\n").length))}
                maxLength={2000}
                placeholder={other ? `Message ${other.displayName}…` : "Message…"}
                aria-label="Message"
                className="min-h-11 flex-1 resize-none rounded-xl border border-[var(--color-edge-strong)] bg-panel px-4 py-2.5 text-sm text-fg outline-none placeholder:text-fg-faint focus:border-gold/50 focus-visible:ring-2 focus-visible:ring-gold"
              />
              <button
                onClick={() => void send()}
                disabled={!draft.trim() || allowed !== true}
                aria-label="Send message"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold text-on-accent transition hover:brightness-110 disabled:opacity-40"
              >
                <Send className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </>
        )}
      </div>

      {reporting && other && (
        <ReportModal target={other} messageId={reporting.id} onClose={() => setReporting(null)} />
      )}
    </div>
  );
}
