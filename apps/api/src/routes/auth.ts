import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import bcrypt from "bcrypt";
import { getSession } from "../middleware/auth.js";
import type { AppState } from "../state.js";

const SESSION_COOKIE = "pve-cloud-session";
const COOKIE_OPTS = "Path=/; HttpOnly; SameSite=Strict; Max-Age=86400";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export function authRoutes(state: AppState) {
  const app = new Hono();

  app.post("/login", zValidator("json", loginSchema), async (c) => {
    if (!state.adminUsername || !state.adminPasswordHash) {
      return c.json({ error: "System not configured" }, 503);
    }

    const { username, password } = c.req.valid("json");

    if (username !== state.adminUsername) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const valid = await bcrypt.compare(password, state.adminPasswordHash);
    if (!valid) return c.json({ error: "Invalid credentials" }, 401);

    const token = crypto.randomUUID();
    const role = username === state.adminUsername ? "admin" : ("user" as const);
    state.sessions.set(token, { username, role, createdAt: Date.now() });

    c.header("Set-Cookie", `${SESSION_COOKIE}=${token}; ${COOKIE_OPTS}`);
    return c.json({ token, username, role });
  });

  app.post("/logout", (c) => {
    const session = getSession(c, state);
    if (session) {
      const token = c.req.header("Authorization")?.slice(7)
        ?? c.req.header("Cookie")?.match(/pve-cloud-session=([^;]+)/)?.[1];
      if (token) state.sessions.delete(token);
    }
    c.header("Set-Cookie", `${SESSION_COOKIE}=; Path=/; Max-Age=0`);
    return c.json({ ok: true });
  });

  app.get("/me", (c) => {
    const session = getSession(c, state);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    return c.json({ username: session.username, role: session.role });
  });

  return app;
}
