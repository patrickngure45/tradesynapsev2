"use client";

/**
 * Root-level error boundary.
 * Next.js requires this to wrap the entire <html> since it replaces the root layout.
 */
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
          background: "#0b0e14",
          color: "#e2e8f0",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 420, padding: "2rem" }}>
          <div
            style={{
              width: 56,
              height: 56,
              margin: "0 auto 1.5rem",
              borderRadius: "50%",
              background: "rgba(239,68,68,0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
            }}
          >
            !
          </div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, margin: "0 0 0.5rem" }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: "0.875rem", color: "#94a3b8", margin: "0 0 1.5rem" }}>
            An unexpected error occurred. Your funds are safe.
            {error.digest && (
              <span style={{ display: "block", marginTop: 8, fontFamily: "monospace", fontSize: "0.75rem" }}>
                Error ID: {error.digest}
              </span>
            )}
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: "0.625rem 1.5rem",
              borderRadius: 8,
              border: "none",
              background: "#0ea5e9",
              color: "#fff",
              fontWeight: 600,
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
