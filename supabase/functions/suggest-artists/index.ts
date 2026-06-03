// ──────────────────────────────────────────────────────────────
// suggest-artists — DeanDB's AI artist-suggestion Edge Function.
//
// A free-tier LLM (Google Gemini Flash) turns a listener's free-text prompt
// into candidate artists; every candidate is then confirmed against MusicBrainz
// so only REAL artists are ever returned (no hallucinations reach the UI).
//
// • The Gemini API key lives here as a secret (`supabase secrets set
//   GEMINI_API_KEY=…`) so it never ships in the browser bundle.
// • The function is JWT-gated — Supabase verifies the caller's session token at
//   the gateway (verify_jwt, on by default) — so it can't be used as an open
//   relay; only signed-in DeanDB users can call it.
// • It is deliberately STATELESS w.r.t. the user's data: the client passes the
//   taste seed + exclusion list. That keeps the contract clean enough to wrap
//   as an MCP tool later (inputs: prompt, seedArtists, excludeArtists).
//
// Deploy:  supabase functions deploy suggest-artists
// Secret:  supabase secrets set GEMINI_API_KEY=<your Google AI Studio key>
// ──────────────────────────────────────────────────────────────

const GEMINI_MODEL = "gemini-2.5-flash"; // swappable; any Gemini Flash model works
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const MB = "https://musicbrainz.org/ws/2";
// MusicBrainz requires a descriptive User-Agent for non-browser clients.
const MB_USER_AGENT = "DeanDB/1.0 ( https://github.com/krhamby/DeanDB )";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const lucene = (s: string) => s.replace(/["\\]/g, " ").trim();
const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

interface SuggestBody {
  prompt?: string;
  seedArtists?: string[];
  excludeArtists?: string[];
  limit?: number;
}

interface Candidate {
  name: string;
  reason: string;
}

// ── Gemini: prompt → candidate artists (names + one-line reasons) ──
async function geminiCandidates(
  apiKey: string,
  prompt: string,
  seedArtists: string[],
  excludeArtists: string[],
  want: number,
): Promise<Candidate[]> {
  const system =
    "You are a music recommendation assistant for a discography-tracking app. " +
    "Given a listener's prompt, suggest real, established recording artists or bands " +
    "that genuinely fit it. Only suggest artists that exist in the MusicBrainz database. " +
    "Offer a spread of well-known and lesser-known acts. For each, give one concise " +
    "sentence (max ~20 words) on why it fits the prompt. Never invent artists.";

  const lines = [`Listener's prompt: ${prompt}`];
  if (seedArtists.length) {
    lines.push(
      `They already enjoy: ${seedArtists.slice(0, 20).join(", ")}. ` +
        "Use this to tailor picks, but match the prompt first.",
    );
  }
  if (excludeArtists.length) {
    lines.push(
      `Do NOT suggest any of these (already in their library): ${excludeArtists
        .slice(0, 100)
        .join(", ")}.`,
    );
  }
  lines.push(`Return about ${want} suggestions.`);

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: lines.join("\n") }] }],
      generationConfig: {
        temperature: 1.0,
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              name: { type: "STRING" },
              reason: { type: "STRING" },
            },
            required: ["name", "reason"],
          },
        },
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((c): c is Candidate => !!c && typeof (c as Candidate).name === "string")
    .map((c) => ({ name: c.name.trim(), reason: (c.reason ?? "").trim() }))
    .filter((c) => c.name.length > 0);
}

// ── MusicBrainz: confirm a candidate exists, canonicalize name + genre ──
interface MBArtist {
  id: string;
  name: string;
  score?: number;
  tags?: Array<{ name: string; count: number }>;
}

async function mbValidate(
  name: string,
): Promise<{ mbid: string; name: string; genre: string | null } | null> {
  const q = `artist:"${lucene(name)}"`;
  const url = `${MB}/artist?query=${encodeURIComponent(q)}&fmt=json&limit=1`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      headers: { "User-Agent": MB_USER_AGENT, Accept: "application/json" },
    });
    if (res.status === 503 || res.status === 429) {
      await sleep(1200 * (attempt + 1)); // rate limited — back off and retry once
      continue;
    }
    if (!res.ok) return null;
    const data = await res.json();
    const hit: MBArtist | undefined = data?.artists?.[0];
    if (!hit) return null;
    const score = typeof hit.score === "number" ? hit.score : 0;
    // Accept a confident match, or an exact (normalized) name match — this drops
    // hallucinated names (no/low-scoring MusicBrainz hit) without over-filtering.
    if (score < 85 && norm(hit.name) !== norm(name)) return null;
    const topTag = hit.tags?.length
      ? [...hit.tags].sort((a, b) => (b.count ?? 0) - (a.count ?? 0))[0].name
      : null;
    return { mbid: hit.id, name: hit.name, genre: topTag ? titleCase(topTag) : null };
  }
  return null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json({ error: "Server is missing GEMINI_API_KEY" }, 500);

  let body: SuggestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return json({ error: "A prompt is required" }, 400);

  const limit = Math.min(Math.max(body.limit ?? 8, 1), 12);
  const seedArtists = (body.seedArtists ?? []).filter((s) => typeof s === "string");
  const excludeArtists = (body.excludeArtists ?? []).filter((s) => typeof s === "string");
  const excludeSet = new Set(excludeArtists.map(norm));

  let candidates: Candidate[];
  try {
    // Ask for a few extra so we still reach `limit` after validation/dedupe drops some.
    candidates = await geminiCandidates(apiKey, prompt, seedArtists, excludeArtists, limit + 4);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Suggestion engine failed" }, 502);
  }

  // Validate sequentially with polite spacing (MusicBrainz asks for ~1 req/sec).
  const suggestions: Array<{ name: string; mbid: string | null; genre: string | null; reason: string }> =
    [];
  const seen = new Set<string>();
  for (const c of candidates) {
    if (suggestions.length >= limit) break;
    if (excludeSet.has(norm(c.name)) || seen.has(norm(c.name))) continue;
    const match = await mbValidate(c.name);
    await sleep(350);
    if (!match) continue;
    if (excludeSet.has(norm(match.name)) || seen.has(norm(match.name))) continue;
    seen.add(norm(c.name));
    seen.add(norm(match.name));
    suggestions.push({ name: match.name, mbid: match.mbid, genre: match.genre, reason: c.reason });
  }

  return json({ suggestions });
});
