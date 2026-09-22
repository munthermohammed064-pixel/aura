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

// Redirect once — concurrent 401s must not fight over location.href, and a
// page that is already /login must not reload-loop.
let loginRedirecting = false;

function redirectToLogin() {
  if (loginRedirecting) return;
  loginRedirecting = true;
  if (window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
}

export async function api<T = unknown>(
  path: string,
  opts: RequestInit & { auth?: boolean; _retried?: boolean } = {},
): Promise<T> {
  const { auth, _retried, ...init } = opts;
  const headers: Record<string, string> =
    init.body instanceof FormData ? {} : { "Content-Type": "application/json" };
  if (auth !== false) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (res.status === 401 && typeof window !== "undefined" && auth !== false && !_retried) {
    const refreshed = await tryRefresh();
    if (refreshed) return api(path, { ...opts, _retried: true });
    clearTokens();
    redirectToLogin();
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
      redirectToLogin();
    }
    throw new Error(detail);
  }
  return body as T;
}

// Single-flight: two concurrent 401s must share ONE refresh call — the second
// would replay an already-rotated token, which the backend treats as theft and
// kills the whole session family.
let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

async function doRefresh(): Promise<boolean> {
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
