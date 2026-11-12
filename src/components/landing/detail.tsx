import Image from "next/image";

// Every capture from `npm run shots` is 2160x1350.
const SHOT_RATIO = 1350 / 2160;

/**
 * A zoomed region of a product screenshot, in the viewer's theme.
 *
 * No second set of image files: the full capture is drawn `zoom` times wider
 * than its frame and shifted so the region whose top-left corner is at
 * (`x`, `y`) — fractions of the capture — fills the frame. A re-run of
 * `npm run shots` therefore refreshes these too. If a capture's LAYOUT
 * changes, re-check the three numbers.
 *
 * Shared by the landing page and the sign-up panel (components/auth).
 *
 * Both variants are lazy: `display: none` suppresses a LAZY fetch but not an
 * eager one and not a `priority` preload, so each visitor downloads one PNG.
 */
export function Detail({
  name,
  alt,
  x,
  y,
  zoom,
  ratio = 4 / 3,
  frameWidth = 540,
}: {
  name: "player" | "listening" | "report";
  alt: string;
  x: number;
  y: number;
  zoom: number;
  /** The frame's width / height. */
  ratio?: number;
  /** About how wide the frame is on desktop, in px — only a hint for `sizes`. */
  frameWidth?: number;
}) {
  const style: React.CSSProperties = {
    position: "absolute",
    width: `${zoom * 100}%`,
    maxWidth: "none",
    height: "auto",
    left: `${-x * zoom * 100}%`,
    // `top` is a share of the FRAME's height, the offset a share of the image's.
    top: `${-y * zoom * SHOT_RATIO * ratio * 100}%`,
  };
  const common = {
    width: 2160,
    height: 1350,
    // The image is `zoom` times wider than its frame.
    sizes: `(min-width: 1024px) ${Math.round(frameWidth * zoom)}px, ${Math.round(zoom * 100)}vw`,
    style,
  };
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-border bg-surface-2 shadow-soft"
      style={{ aspectRatio: String(ratio) }}
    >
      <div className="dark:hidden">
        <Image src={`/shots/${name}-light.png`} alt={alt} loading="lazy" {...common} />
      </div>
      <div className="hidden dark:block">
        {/* Same picture, so it is decorative to a screen reader. */}
        <Image src={`/shots/${name}-dark.png`} alt="" aria-hidden loading="lazy" {...common} />
      </div>
    </div>
  );
}
