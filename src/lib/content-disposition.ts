/**
 * An `attachment` Content-Disposition header for any filename.
 *
 * HTTP header values may only carry bytes up to 0xFF, so a report named after a
 * Cyrillic or Uzbek-Cyrillic student ("Мадина - Mock 3.pdf") made the response
 * constructor throw and the download answered 500 (security audit 2026-11-25).
 * RFC 6266: a plain-ASCII `filename=` fallback for old clients, plus
 * `filename*=UTF-8''…` with the real name, which every current browser prefers.
 */
export function attachmentDisposition(filename: string): string {
  const ascii =
    filename
      .normalize("NFKD")
      .replace(/[^\x20-\x7e]/g, "")
      .replace(/["\\]/g, "")
      .replace(/\s+/g, " ")
      .trim() || "download";
  // encodeURIComponent leaves ' ( ) * ! unescaped; RFC 5987 attr-chars do not allow ' ( ) *.
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
