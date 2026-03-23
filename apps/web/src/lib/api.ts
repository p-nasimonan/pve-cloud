const API_URL = import.meta.env.API_URL ?? "http://localhost:3001";

function getToken(request?: Request): string | undefined {
  if (!request) return undefined;
  const cookie = request.headers.get("cookie") ?? "";
  return cookie.match(/pve-cloud-session=([^;]+)/)?.[1];
}

interface FetchOptions {
  method?: string;
  body?: unknown;
  token?: string;
}

async function apiFetch<T>(
  path: string,
  opts: FetchOptions = {},
): Promise<T | null> {
  const { method = "GET", body, token } = opts;
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Unauthenticated GET — for setup/status checks */
export async function apiGet<T>(path: string): Promise<T | null> {
  return apiFetch<T>(path);
}

/** Authenticated GET using session cookie from SSR request */
export async function apiGetAuthed<T>(
  path: string,
  request: Request,
): Promise<T | null> {
  return apiFetch<T>(path, { token: getToken(request) });
}

export { API_URL, getToken };
