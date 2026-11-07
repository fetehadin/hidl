"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "ui-rounded, system-ui, sans-serif", background: "#f5f3ee", color: "#1b2a2c", colorScheme: "light", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontWeight: 600 }}>Something went wrong.</h1>
          <button type="button" onClick={reset} style={{ marginTop: 16, padding: "12px 22px", borderRadius: 16, border: 0, background: "#2e7c7f", color: "#ffffff", fontSize: 17, fontWeight: 700 }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
