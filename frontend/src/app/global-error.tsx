"use client";

// Last-resort boundary — fires even if the root layout/providers crash,
// so it must render its own <html>/<body> and cannot use translations.
// The user's chosen language is still readable from localStorage.
const MSG: Record<string, { title: string; retry: string }> = {
  en: { title: "Something went wrong", retry: "Retry" },
  ar: { title: "حدث خطأ ما", retry: "إعادة المحاولة" },
  es: { title: "Algo salió mal", retry: "Reintentar" },
  fr: { title: "Une erreur est survenue", retry: "Réessayer" },
  tr: { title: "Bir sorun oluştu", retry: "Tekrar dene" },
  ru: { title: "Что-то пошло не так", retry: "Повторить" },
  de: { title: "Ein Fehler ist aufgetreten", retry: "Erneut versuchen" },
};

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  const l = typeof window !== "undefined" ? (localStorage.getItem("lang") ?? "en") : "en";
  const m = MSG[l] ?? MSG.en;
  return (
    <html lang={l}>
      <body style={{
        margin: 0, minHeight: "100svh", display: "grid", placeItems: "center",
        background: "#F3EFE6", color: "#1C1A15",
        fontFamily: "system-ui, sans-serif",
      }}>
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <p style={{ fontFamily: "monospace", letterSpacing: "0.3em", color: "#9A742C", fontSize: 12 }}>
            NEXORA · LOS ANGELES
          </p>
          <h1 style={{ fontSize: "1.4rem", margin: "1rem 0" }}>{m.title}</h1>
          <button onClick={reset} style={{
            border: "1px solid #9A742C", background: "transparent", color: "#9A742C",
            padding: "0.6rem 1.6rem", borderRadius: "0.75rem", cursor: "pointer", fontSize: "0.9rem",
          }}>
            {m.retry}
          </button>
        </div>
      </body>
    </html>
  );
}
