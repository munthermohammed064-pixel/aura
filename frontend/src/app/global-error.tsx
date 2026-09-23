"use client";

// Last-resort boundary — fires even if the root layout/providers crash,
// so it must render its own <html>/<body> and cannot use translations.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{
        margin: 0, minHeight: "100svh", display: "grid", placeItems: "center",
        background: "#F3EFE6", color: "#1C1A15",
        fontFamily: "system-ui, sans-serif",
      }}>
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <p style={{ fontFamily: "monospace", letterSpacing: "0.3em", color: "#9A742C", fontSize: 12 }}>
            NEXORA · LOS ANGELES
          </p>
          <h1 style={{ fontSize: "1.4rem", margin: "1rem 0" }}>Something went wrong</h1>
          <button onClick={reset} style={{
            border: "1px solid #9A742C", background: "transparent", color: "#9A742C",
            padding: "0.6rem 1.6rem", borderRadius: "0.75rem", cursor: "pointer", fontSize: "0.9rem",
          }}>
            Retry
          </button>
        </div>
      </body>
    </html>
  );
}
