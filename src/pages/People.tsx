import { useEffect, useState } from "react";
import { useAuth, usePeopleSearch } from "../lib/store";
import * as api from "../lib/api";
import type { PersonResult } from "../types";
import { Panel, SectionTitle } from "../components/ui";
import { PersonRow } from "../components/social";

export function People() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const { results, loading } = usePeopleSearch(q);
  const [requests, setRequests] = useState<PersonResult[]>([]);
  const [following, setFollowing] = useState<PersonResult[]>([]);

  const loadGraph = () => {
    if (!user) return;
    api.listFollowers(user.id).then((list) => setRequests(list.filter((p) => !p.followsMe)));
    api.listFollowing(user.id).then(setFollowing);
  };
  useEffect(loadGraph, [user]);

  const accept = async (followerId: string) => {
    if (!user) return;
    await api.acceptFollow(followerId, user.id);
    loadGraph();
  };

  return (
    <div className="space-y-8">
      <div>
        <SectionTitle kicker="Find your people" title="People" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or @username…"
          className="w-full rounded-xl border border-[var(--color-edge-strong)] bg-panel px-4 py-2.5 text-sm text-fg outline-none placeholder:text-fg-faint focus:border-gold/50 focus-visible:ring-2 focus-visible:ring-gold"
        />
        <div className="mt-3 space-y-2 stagger-children">
          {loading && <p className="text-sm text-fg-faint">Searching…</p>}
          {!loading && q.trim().length >= 2 && results.length === 0 && (
            <p className="text-sm text-fg-faint">No one matches “{q}”.</p>
          )}
          {results.map((p) => (
            <PersonRow key={p.profile.id} person={p} onChanged={loadGraph} />
          ))}
        </div>
      </div>

      {requests.length > 0 && (
        <div>
          <SectionTitle kicker="Waiting on you" title="Follow Requests" />
          <div className="space-y-2">
            {requests.map((p) => (
              <Panel key={p.profile.id} className="flex items-center justify-between gap-3 p-3">
                <span className="font-display font-black text-fg">
                  {p.profile.displayName}{" "}
                  <span className="text-xs font-normal text-fg-faint">@{p.profile.username}</span>
                </span>
                <button
                  onClick={() => accept(p.profile.id)}
                  className="rounded-lg bg-gold px-3 py-1.5 text-xs font-bold text-on-accent hover:brightness-110"
                >
                  Accept
                </button>
              </Panel>
            ))}
          </div>
        </div>
      )}

      {following.length > 0 && (
        <div>
          <SectionTitle kicker={`${following.length} people`} title="Following" />
          <div className="space-y-2 stagger-children">
            {following.map((p) => (
              <PersonRow key={p.profile.id} person={p} onChanged={loadGraph} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
