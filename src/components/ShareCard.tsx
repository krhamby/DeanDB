import { forwardRef } from "react";
import { gradient } from "../lib/format";
import { scoreColor } from "./ui";

export const CARD_W = 540;
export const CARD_H = 675;

export interface VerdictCardProps {
  title: string;
  artist: string;
  rating: number | null;
  review: string;
  cover: [string, string];
  meterName: string;
}

/** A self-contained, fixed-palette share card (deterministic export, no external images). */
export const VerdictCard = forwardRef<HTMLDivElement, VerdictCardProps>(function VerdictCard(
  { title, artist, rating, review, cover, meterName },
  ref,
) {
  const score = rating == null ? "—" : rating.toFixed(1);
  const accent = scoreColor(rating);
  const quote = review.trim().length > 180 ? review.trim().slice(0, 177) + "…" : review.trim();
  return (
    <div
      ref={ref}
      style={{
        width: CARD_W,
        height: CARD_H,
        background: "#120f17",
        color: "#f4f1ea",
        fontFamily: "'Inter Variable', Inter, system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Cover hero (gradient + vinyl) */}
      <div style={{ height: 300, position: "relative", background: gradient(cover) }}>
        <div
          style={{
            position: "absolute",
            right: "-12%",
            top: "50%",
            transform: "translateY(-50%)",
            width: 220,
            height: 220,
            borderRadius: "50%",
            background: "radial-gradient(circle, #1a1a1a 38%, #0c0c0c 39%, #1a1a1a 40%, #0c0c0c 60%)",
            opacity: 0.9,
          }}
        />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.1), rgba(18,15,23,0.95))" }} />
        <div style={{ position: "absolute", left: 32, bottom: 24, right: 32 }}>
          <div style={{ fontSize: 13, letterSpacing: "0.2em", textTransform: "uppercase", color: "#ffd166", fontWeight: 800 }}>
            The Verdict
          </div>
          <div style={{ fontFamily: "'Fraunces Variable', Fraunces, serif", fontWeight: 900, fontSize: 40, lineHeight: 1.02, marginTop: 6 }}>
            {title}
          </div>
          <div style={{ fontSize: 16, color: "#cfc9be", marginTop: 4 }}>{artist}</div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: "26px 32px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontFamily: "'Fraunces Variable', Fraunces, serif", fontWeight: 900, fontSize: 64, lineHeight: 1, color: accent }}>
            {score}
          </span>
          <span style={{ fontSize: 18, color: "#8d8678", fontWeight: 700 }}>/ 10 &middot; {meterName} Meter</span>
        </div>
        {quote && (
          <p style={{ fontFamily: "'Fraunces Variable', Fraunces, serif", fontStyle: "italic", fontSize: 19, lineHeight: 1.45, color: "#e7e2d8", marginTop: 18 }}>
            {"“"}{quote}{"”"}
          </p>
        )}
        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "'Fraunces Variable', Fraunces, serif", fontWeight: 900, fontSize: 20 }}>
            <span style={{ background: "#f5c518", color: "#000", padding: "2px 8px", borderRadius: 7 }}>Dean</span>
            <span style={{ marginLeft: 5 }}>DB</span>
          </span>
          <span style={{ fontSize: 13, color: "#8d8678" }}>deandb.app</span>
        </div>
      </div>
    </div>
  );
});
