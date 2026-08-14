import { useEffect, useState } from "react";
import { Check, ShieldAlert } from "lucide-react";
import type { ReportReason } from "../types";
import { useAuth } from "../lib/store";
import * as api from "../lib/api";
import { ModalShell, Select } from "./ui";
import { Menu } from "./Menu";

// ──────────────────────────────────────────────────────────────
// Safety surfaces: report + block. The server is the enforcement point
// (RLS + triggers in the direct_messages migration); these components are
// the UI for filing reports and managing blocks.
// ──────────────────────────────────────────────────────────────

/** The minimal identity these surfaces need about the other person. */
export interface ModerationTarget {
  id: string;
  username: string;
  displayName: string;
}

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "spam", label: "Spam or unwanted contact" },
  { value: "harassment", label: "Harassment or abuse" },
  { value: "impersonation", label: "Impersonation" },
  { value: "other", label: "Something else" },
];

/**
 * File a moderation report about `target` — optionally anchored to a specific
 * message (the DB snapshots its body server-side so "unsend" can't destroy the
 * evidence). Reports go to the operator; the reported user is never notified.
 */
export function ReportModal({
  target,
  messageId,
  onClose,
}: {
  target: ModerationTarget;
  /** When reporting a specific DM rather than the person in general. */
  messageId?: string;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [reason, setReason] = useState<ReportReason>("spam");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await api.reportUser(user.id, target.id, reason, details.trim(), messageId);
      setDone(true);
      setTimeout(onClose, 1200);
    } catch {
      setError("Couldn't file the report. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell onClose={onClose} title={`Report @${target.username}`}>
      {done ? (
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-status-done)]">
          <Check className="h-4 w-4" aria-hidden /> Report filed — thank you.
        </p>
      ) : (
        <>
          <p className="text-sm text-fg-muted">
            {messageId ? "Report this message" : `Report ${target.displayName}`} to the DeanDB team.
            They won't know you filed it.
          </p>
          <label className="block text-xs font-semibold uppercase tracking-wide text-fg-faint">
            Reason
            <Select value={reason} onChange={(v) => setReason(v as ReportReason)} className="mt-1 w-full">
              {REPORT_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </label>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Anything that helps us understand what happened (optional)…"
            className="w-full rounded-lg border border-[var(--color-edge-strong)] bg-panel-2 p-3 text-sm text-fg outline-none placeholder:text-fg-faint focus:border-gold/50 focus-visible:ring-2 focus-visible:ring-gold"
          />
          {error && <p className="text-sm font-semibold text-dean">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-edge px-3 py-1.5 text-sm text-fg-muted hover:text-fg">
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={busy}
              className="rounded-lg bg-dean px-4 py-1.5 text-sm font-bold text-on-dean hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "Filing…" : "File report"}
            </button>
          </div>
        </>
      )}
    </ModalShell>
  );
}

/** Confirm-and-block. Spells out exactly what blocking does before committing. */
export function BlockModal({
  target,
  onBlocked,
  onClose,
}: {
  target: ModerationTarget;
  onBlocked?: () => void;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const block = async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await api.blockUser(user.id, target.id);
      onBlocked?.();
      onClose();
    } catch {
      setError("Couldn't block right now. Please try again.");
      setBusy(false);
    }
  };

  return (
    <ModalShell onClose={onClose} title={`Block @${target.username}?`}>
      <ul className="list-inside list-disc space-y-1 text-sm text-fg-muted">
        <li>You and {target.displayName} immediately unfollow each other.</li>
        <li>They can't follow you, message you, or send you recommendations.</li>
        <li>They won't be told they've been blocked.</li>
      </ul>
      <p className="text-xs text-fg-faint">You can unblock anytime from Settings → Blocked users.</p>
      {error && <p className="text-sm font-semibold text-dean">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-edge px-3 py-1.5 text-sm text-fg-muted hover:text-fg">
          Cancel
        </button>
        <button
          onClick={block}
          disabled={busy}
          className="rounded-lg bg-dean px-4 py-1.5 text-sm font-bold text-on-dean hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "Blocking…" : "Block"}
        </button>
      </div>
    </ModalShell>
  );
}

/**
 * The ⋯ safety menu shown next to another person (profile header, DM thread):
 * Report, and Block/Unblock. Owns its modals and the my-block-toward-them state.
 */
export function ModerationMenu({
  target,
  onBlockChanged,
}: {
  target: ModerationTarget;
  /** Fires after a block/unblock commits, so hosts can refresh relationship UI. */
  onBlockChanged?: (blocked: boolean) => void;
}) {
  const { user } = useAuth();
  const [blocked, setBlocked] = useState(false);
  const [modal, setModal] = useState<"report" | "block" | null>(null);

  useEffect(() => {
    if (!user || user.id === target.id) return;
    let active = true;
    api.hasBlocked(user.id, target.id).then((b) => active && setBlocked(b));
    return () => {
      active = false;
    };
  }, [user, target.id]);

  if (!user || user.id === target.id) return null;

  const unblock = async () => {
    await api.unblockUser(user.id, target.id);
    setBlocked(false);
    onBlockChanged?.(false);
  };

  return (
    <>
      <Menu
        label={
          <span className="inline-flex items-center gap-1">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> Safety
          </span>
        }
        actions={[
          { label: `Report @${target.username}`, onSelect: () => setModal("report") },
          blocked
            ? { label: `Unblock @${target.username}`, onSelect: () => void unblock() }
            : { label: `Block @${target.username}`, onSelect: () => setModal("block"), danger: true },
        ]}
      />
      {modal === "report" && <ReportModal target={target} onClose={() => setModal(null)} />}
      {modal === "block" && (
        <BlockModal
          target={target}
          onBlocked={() => {
            setBlocked(true);
            onBlockChanged?.(true);
          }}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
