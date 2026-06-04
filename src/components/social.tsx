import { useEffect, useState } from "react";
import { Check, Lock } from "lucide-react";
import type { PersonResult, Profile } from "../types";
import { navigate, profilePath } from "../lib/router";
import { useAuth } from "../lib/store";
import * as api from "../lib/api";
import { Panel } from "./ui";

/** Circular avatar — image when set, else a gradient initial. */
export function Avatar({
  profile,
  size = 40,
}: {
  profile: Pick<Profile, "username" | "displayName" | "avatarUrl">;
  size?: number;
}) {
  if (profile.avatarUrl) {
    return (
      <img
        src={profile.avatarUrl}
        alt={profile.displayName ?? profile.username}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold/80 to-dean/70 font-display font-black text-black"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {(profile.displayName || profile.username || "?").slice(0, 1).toUpperCase()}
    </div>
  );
}

/** A clickable person row used in search / followers / following lists. */
export function PersonRow({
  person,
  onChanged,
}: {
  person: PersonResult;
  onChanged?: () => void;
}) {
  const { user } = useAuth();
  const [status, setStatus] = useState(person.followStatus);
  const [busy, setBusy] = useState(false);
  const me = person.profile.id === user?.id;

  const toggle = async () => {
    if (!user || me) return;
    setBusy(true);
    try {
      if (status) {
        await api.unfollowUser(user.id, person.profile.id);
        setStatus(null);
      } else {
        await api.followUser(user.id, person.profile.id);
        // Public targets auto-accept; private stay pending.
        setStatus(person.profile.visibility === "public" ? "accepted" : "pending");
      }
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="flex items-center gap-3 p-3">
      <button
        onClick={() => navigate(profilePath(person.profile.username))}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <Avatar profile={person.profile} />
        <div className="min-w-0">
          <div className="truncate font-display font-black text-fg">{person.profile.displayName}</div>
          <div className="truncate text-xs text-fg-faint">
            @{person.profile.username}
            {person.profile.visibility === "private" && (
              <span className="inline-flex items-center gap-1"> · <Lock className="h-3 w-3" aria-hidden /> private</span>
            )}
            {person.followsMe && " · follows you"}
          </div>
        </div>
      </button>
      {!me && (
        <button
          onClick={toggle}
          disabled={busy}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
            status === "accepted"
              ? "border border-edge text-fg-muted hover:text-dean"
              : status === "pending"
                ? "border border-edge text-fg-faint"
                : "bg-gold text-on-accent hover:brightness-110"
          }`}
        >
          {status === "accepted" ? "Following" : status === "pending" ? "Requested" : "Follow"}
        </button>
      )}
    </Panel>
  );
}

/** Follow / Requested / Following button for a single profile (e.g. on a profile page). */
export function FollowButton({
  target,
  initialStatus,
  onChanged,
}: {
  target: Profile;
  initialStatus: "pending" | "accepted" | null;
  onChanged?: () => void;
}) {
  const { user } = useAuth();
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  useEffect(() => setStatus(initialStatus), [initialStatus]);
  if (!user || user.id === target.id) return null;

  const toggle = async () => {
    setBusy(true);
    try {
      if (status) {
        await api.unfollowUser(user.id, target.id);
        setStatus(null);
      } else {
        await api.followUser(user.id, target.id);
        setStatus(target.visibility === "public" ? "accepted" : "pending");
      }
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold transition disabled:opacity-50 ${
        status === "accepted"
          ? "border border-edge text-fg-muted hover:text-dean"
          : status === "pending"
            ? "border border-edge text-fg-faint"
            : "bg-gold text-on-accent hover:brightness-110"
      }`}
    >
      {status === "accepted" ? (
        <>
          <Check className="h-3.5 w-3.5" aria-hidden /> Following
        </>
      ) : status === "pending" ? (
        "Requested"
      ) : (
        "+ Follow"
      )}
    </button>
  );
}

/**
 * Modal to recommend an album/artist to one of the people you follow.
 * `subject` carries the catalog id; `label` is shown for confirmation.
 */
export function RecommendModal({
  subject,
  label,
  onClose,
}: {
  subject: { albumId?: string; artistId?: string };
  label: string;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [people, setPeople] = useState<PersonResult[]>([]);
  const [toUser, setToUser] = useState<string>("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.listFollowing(user.id).then((list) => {
      const accepted = list.filter((p) => p.followStatus === "accepted");
      setPeople(accepted);
      if (accepted[0]) setToUser(accepted[0].profile.id);
    });
  }, [user]);

  const send = async () => {
    if (!user || !toUser) return;
    setSending(true);
    try {
      await api.sendRecommendation(user.id, toUser, subject, note);
      setSent(true);
      setTimeout(onClose, 900);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <Panel className="w-full max-w-md space-y-4 p-6" >
        <div onClick={(e) => e.stopPropagation()} className="space-y-4">
          <h3 className="font-display text-lg font-black text-fg">Recommend “{label}”</h3>
          {sent ? (
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-status-done)]">
              <Check className="h-4 w-4" aria-hidden /> Sent!
            </p>
          ) : people.length === 0 ? (
            <p className="text-sm text-fg-muted">
              Follow some people first — you can recommend to anyone you follow.
            </p>
          ) : (
            <>
              <label className="block text-xs font-semibold uppercase tracking-wide text-fg-faint">
                To
                <select
                  value={toUser}
                  onChange={(e) => setToUser(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--color-edge-strong)] bg-panel-2 px-3 py-2 text-sm text-fg outline-none focus:border-gold/50 focus-visible:ring-2 focus-visible:ring-gold"
                >
                  {people.map((p) => (
                    <option key={p.profile.id} value={p.profile.id}>
                      {p.profile.displayName} (@{p.profile.username})
                    </option>
                  ))}
                </select>
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Why they need to hear this…"
                className="w-full rounded-lg border border-[var(--color-edge-strong)] bg-panel-2 p-3 text-sm text-fg outline-none placeholder:text-fg-faint focus:border-gold/50 focus-visible:ring-2 focus-visible:ring-gold"
              />
            </>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-edge px-3 py-1.5 text-sm text-fg-muted hover:text-fg">
              Close
            </button>
            {!sent && people.length > 0 && (
              <button
                onClick={send}
                disabled={sending || !toUser}
                className="rounded-lg bg-gold px-4 py-1.5 text-sm font-bold text-on-accent hover:brightness-110 disabled:opacity-50"
              >
                {sending ? "Sending…" : "Send"}
              </button>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}
