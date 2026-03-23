import type { Context, Next } from "hono";
import type { AppState, Session } from "../state.js";

const PUBLIC_PATHS = ["/api/setup", "/api/auth/login", "/api/health"];
const SETUP_ONLY_PATHS = ["/api/setup", "/api/health"];

function extractToken(c: Context): string | null {
  const header = c.req.header("Authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7);
  // cookie fallback for SSR
  const cookies = c.req.header("Cookie") ?? "";
  const match = cookies.match(/pve-cloud-session=([^;]+)/);
  return match?.[1] ?? null;
}

export function getSession(c: Context, state: AppState): Session | null {
  const token = extractToken(c);
  return token ? (state.sessions.get(token) ?? null) : null;
}

export function requireSetup(state: AppState) {
  return async (c: Context, next: Next) => {
    const path = c.req.path;
    if (SETUP_ONLY_PATHS.some((p) => path.startsWith(p))) return next();
    if (!state.proxmoxClient) {
      return c.json({ error: "System not configured. Complete setup first." }, 503);
    }
    return next();
  };
}

export function requireAuth(state: AppState) {
  return async (c: Context, next: Next) => {
    const path = c.req.path;
    if (PUBLIC_PATHS.some((p) => path.startsWith(p))) return next();
    const session = getSession(c, state);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    return next();
  };
}

export function requireAdmin(state: AppState) {
  return async (c: Context, next: Next) => {
    const session = getSession(c, state);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    if (session.role !== "admin") return c.json({ error: "Forbidden" }, 403);
    return next();
  };
}
