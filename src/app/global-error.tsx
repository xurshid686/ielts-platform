"use client";

// Last-resort boundary: catches failures in the ROOT layout itself, which the
// other boundaries render inside of and therefore cannot catch. It replaces
// the whole document, so it must ship its own <html>/<body> and cannot use the
// app's components or Tailwind classes — the stylesheet may be what failed.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#faf6f0",
          color: "#2b2420",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          textAlign: "center",
          padding: "24px",
        }}
      >
        <div>
          <h1 style={{ fontSize: "20px", margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ margin: "0 0 20px", color: "#8a7d70", fontSize: "14px" }}>
            The site failed to load. Please try again.
          </p>
          <button
            onClick={reset}
            style={{
              background: "#c0572e",
              color: "#fffaf4",
              border: 0,
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest ? (
            <p style={{ marginTop: "24px", fontSize: "12px", color: "#8a7d70" }}>
              Reference: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
