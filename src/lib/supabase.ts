import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";
import type { DeanDBData } from "../types";

// A single shared row holds the entire DeanDB document as JSONB.
const STATE_TABLE = "deandb_state";
const ROW_ID = 1;

export const supabaseEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const client: SupabaseClient | null = supabaseEnabled
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    })
  : null;

/** Read the published marathon state. Returns null if no row exists yet. */
export async function loadState(): Promise<DeanDBData | null> {
  if (!client) return null;
  const { data, error } = await client
    .from(STATE_TABLE)
    .select("data")
    .eq("id", ROW_ID)
    .maybeSingle();
  if (error) {
    console.error("Supabase load failed:", error.message);
    throw error;
  }
  return (data?.data as DeanDBData | undefined) ?? null;
}

/**
 * Publish state. Writes go through a SECURITY DEFINER RPC that checks the
 * editor passcode server-side, so the anon key alone cannot modify data.
 */
export async function saveState(
  payload: DeanDBData,
  passcode: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!client) return { ok: false, error: "Supabase is not configured." };
  const { error } = await client.rpc("save_deandb", {
    new_data: payload,
    passcode,
  });
  if (error) {
    return {
      ok: false,
      error: /passcode/i.test(error.message)
        ? "Wrong editor passcode."
        : error.message,
    };
  }
  return { ok: true };
}

/**
 * Live updates: invokes `onChange` whenever the published row changes.
 * Returns an unsubscribe function. No-op when Supabase is disabled.
 */
export function subscribe(onChange: (next: DeanDBData) => void): () => void {
  if (!client) return () => {};
  const channel = client
    .channel("deandb_state_changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: STATE_TABLE },
      (payload) => {
        const next = (payload.new as { data?: DeanDBData } | null)?.data;
        if (next) onChange(next);
      },
    )
    .subscribe();
  return () => {
    client.removeChannel(channel);
  };
}
