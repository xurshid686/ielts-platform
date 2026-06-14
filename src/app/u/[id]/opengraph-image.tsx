import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import { tierForRating, estimatedBand, type TierName } from "@/lib/rating";
import type { PublicProfile } from "@/types/database";

export const alt = "IELTS Practice profile";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Hex pairs per metal (the Tailwind gradient classes in lib/rating.ts can't
// be used here — satori needs raw CSS).
const TIER_COLORS: Record<TierName, [string, string]> = {
  Bronze: ["#b45309", "#ea580c"],
  Silver: ["#94a3b8", "#64748b"],
  Gold: ["#facc15", "#f59e0b"],
  Platinum: ["#67e8f9", "#2dd4bf"],
  Diamond: ["#38bdf8", "#6366f1"],
  Master: ["#d946ef", "#9333ea"],
  Grandmaster: ["#f43f5e", "#dc2626"],
  Legend: ["#fcd34d", "#a78bfa"],
};

async function fetchProfile(id: string): Promise<PublicProfile | null> {
  // Public RPC — anon key, no cookies needed (also keeps this route cacheable).
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data, error } = await supabase.rpc("public_profile", { p_id: id });
  if (error || !data) return null;
  return data as PublicProfile;
}

export default async function OgImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await fetchProfile(id);

  const name = p?.name || "IELTS student";
  const rating = p?.rating ?? 1000;
  const tier = tierForRating(rating);
  const [c1, c2] = TIER_COLORS[tier.name];

  const stats: { label: string; value: string }[] = p
    ? [
        ...(p.global_rank ? [{ label: "Global rank", value: `#${p.global_rank}` }] : []),
        { label: "Tests done", value: `${p.tests_completed}` },
        ...(p.best_band != null ? [{ label: "Best band", value: p.best_band.toFixed(1) }] : []),
        { label: "Peak rating", value: `${p.peak_rating}` },
      ]
    : [];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          backgroundColor: "#0a0f1d",
          backgroundImage:
            "radial-gradient(800px 500px at 110% -10%, rgba(99,102,241,0.35), transparent 60%), radial-gradient(700px 450px at -10% 110%, rgba(45,212,191,0.25), transparent 55%)",
          color: "#e5e7eb",
          fontFamily: "sans-serif",
        }}
      >
        {/* Header: brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: 16,
              backgroundImage: "linear-gradient(135deg, #818cf8, #a78bfa, #2dd4bf)",
              fontSize: 30,
            }}
          >
            🎓
          </div>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: "#ffffff" }}>
            IELTS Practice
          </div>
        </div>

        {/* Middle: name + tier + rating */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 720 }}>
            <div
              style={{
                display: "flex",
                fontSize: 64,
                fontWeight: 800,
                color: "#ffffff",
                lineHeight: 1.1,
              }}
            >
              {name}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 24px",
                  borderRadius: 999,
                  backgroundImage: `linear-gradient(135deg, ${c1}, ${c2})`,
                  color: "#ffffff",
                  fontSize: 32,
                  fontWeight: 700,
                }}
              >
                {tier.label}
              </div>
              <div style={{ display: "flex", fontSize: 30, color: "#94a3b8" }}>
                ≈ Band {estimatedBand(rating)} reading
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "28px 44px",
              borderRadius: 28,
              backgroundColor: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.14)",
            }}
          >
            <div style={{ display: "flex", fontSize: 26, color: "#94a3b8" }}>Rating</div>
            <div
              style={{
                display: "flex",
                fontSize: 96,
                fontWeight: 800,
                color: "#ffffff",
                lineHeight: 1.05,
              }}
            >
              {rating}
            </div>
          </div>
        </div>

        {/* Footer: stat chips */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {stats.map((s) => (
            <div
              key={s.label}
              style={{
                display: "flex",
                flexDirection: "column",
                padding: "16px 28px",
                borderRadius: 20,
                backgroundColor: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              <div style={{ display: "flex", fontSize: 22, color: "#94a3b8" }}>{s.label}</div>
              <div style={{ display: "flex", fontSize: 36, fontWeight: 700, color: "#ffffff" }}>
                {s.value}
              </div>
            </div>
          ))}
          <div
            style={{
              display: "flex",
              marginLeft: "auto",
              fontSize: 24,
              color: "#94a3b8",
            }}
          >
            Practise daily · climb the leaderboard
          </div>
        </div>
      </div>
    ),
    size,
  );
}
