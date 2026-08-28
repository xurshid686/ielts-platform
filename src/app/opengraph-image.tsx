import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site";

// The site-wide link preview. Next wires this into every page that does not
// declare its own image — including the per-test pages, which already ask for
// `twitter:card: summary_large_image` but had no image behind it.
//
// Generated rather than a committed PNG so the copy tracks SITE_NAME and no
// binary enters git. There are no dynamic params, so it renders once at build.
//
// Satori rules, learned the hard way in u/[id]/opengraph-image.tsx: no Tailwind
// classes, raw CSS only, and EVERY element needs an explicit `display: flex` —
// including leaf text nodes. Fonts are the built-in sans-serif; nothing is
// fetched.
export const alt = "Free IELTS mock tests with instant band scores";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
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
          // Same two gradients as the profile card, so the two read as a family.
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
              fontSize: 32,
              fontWeight: 800,
              color: "#0a0f1d",
            }}
          >
            M
          </div>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: "#ffffff" }}>
            {SITE_NAME}
          </div>
        </div>

        {/* Middle: the promise */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 940 }}>
          <div
            style={{
              display: "flex",
              fontSize: 68,
              fontWeight: 800,
              color: "#ffffff",
              lineHeight: 1.08,
            }}
          >
            Free IELTS mock tests
          </div>
          <div style={{ display: "flex", fontSize: 32, color: "#cbd5e1", lineHeight: 1.35 }}>
            Reading · Listening · AI Speaking — in the real computer-delivered exam format,
            with instant band scores.
          </div>
        </div>

        {/* Footer chips */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {["No account needed to start", "Answer explanations", "Instant band score"].map(
            (chip) => (
              <div
                key={chip}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "12px 22px",
                  borderRadius: 999,
                  backgroundColor: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  fontSize: 24,
                  color: "#e2e8f0",
                }}
              >
                {chip}
              </div>
            ),
          )}
        </div>
      </div>
    ),
    size,
  );
}
