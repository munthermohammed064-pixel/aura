export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
export const PLATFORM_NAME = process.env.NEXT_PUBLIC_PLATFORM_NAME ?? "Los Angeles";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem("access_token", access);
  localStorage.setItem("refresh_token", refresh);
}

export function clearTokens() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}

export async function api<T = unknown>(
  path: string,
  opts: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> =
    opts.body instanceof FormData ? {} : { "Content-Type": "application/json" };
  if (opts.auth !== false) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}${path}`, { ...opts, headers });
  if (res.status === 401 && typeof window !== "undefined" && opts.auth !== false) {
    const refreshed = await tryRefresh();
    if (refreshed) return api(path, opts);
    clearTokens();
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // FastAPI 422s return detail as an array of {msg} objects — flatten it.
    const raw = body.detail;
    const detail: string = typeof raw === "string" ? raw
      : Array.isArray(raw) ? raw.map((x) => x?.msg ?? String(x)).join("; ")
      : `Request failed (${res.status})`;
    if (res.status === 403 && /frozen/i.test(detail) && typeof window !== "undefined") {
      clearTokens();
      window.location.href = "/login";
    }
    throw new Error(detail);
  }
  return body as T;
}

async function tryRefresh(): Promise<boolean> {
  const refresh = localStorage.getItem("refresh_token");
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    setTokens(data.access_token, data.refresh_token);
    return true;
  } catch {
    return false;
  }
}
