// Approximate IELTS raw (out of 40) -> band conversion.
// Used as a fallback if a test HTML reports raw/total but not a band.

type Band = { min: number; band: number };

const READING: Band[] = [
  { min: 39, band: 9 }, { min: 37, band: 8.5 }, { min: 35, band: 8 },
  { min: 33, band: 7.5 }, { min: 30, band: 7 }, { min: 27, band: 6.5 },
  { min: 23, band: 6 }, { min: 19, band: 5.5 }, { min: 15, band: 5 },
  { min: 13, band: 4.5 }, { min: 10, band: 4 }, { min: 8, band: 3.5 },
  { min: 6, band: 3 }, { min: 4, band: 2.5 }, { min: 0, band: 0 },
];

const LISTENING: Band[] = [
  { min: 39, band: 9 }, { min: 37, band: 8.5 }, { min: 35, band: 8 },
  { min: 32, band: 7.5 }, { min: 30, band: 7 }, { min: 26, band: 6.5 },
  { min: 23, band: 6 }, { min: 18, band: 5.5 }, { min: 16, band: 5 },
  { min: 13, band: 4.5 }, { min: 11, band: 4 }, { min: 8, band: 3.5 },
  { min: 6, band: 3 }, { min: 4, band: 2.5 }, { min: 0, band: 0 },
];

export function rawToBand(
  skill: "reading" | "listening",
  raw: number,
  total = 40,
): number {
  // Normalise to a /40 scale if the test had a different total.
  const scaled = total === 40 ? raw : Math.round((raw / total) * 40);
  const table = skill === "listening" ? LISTENING : READING;
  for (const row of table) {
    if (scaled >= row.min) return row.band;
  }
  return 0;
}
