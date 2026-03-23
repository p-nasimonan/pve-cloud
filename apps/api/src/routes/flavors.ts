import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getSession, requireAdmin } from "../middleware/auth.js";
import type { AppState } from "../state.js";

const flavorSchema = z.object({
  name: z.string().min(1).max(64),
  cpu: z.number().int().min(1).max(128),
  memoryMb: z.number().int().min(128),
  diskGb: z.number().int().min(1),
  userVisible: z.boolean(),
  description: z.string().max(256).optional(),
});

export function flavorRoutes(state: AppState) {
  const app = new Hono();

  /** List flavors — admins see all, users see only userVisible=true */
  app.get("/", (c) => {
    if (!state.configStore) return c.json({ error: "Not configured" }, 503);
    const session = getSession(c, state);
    const flavors =
      session?.role === "admin"
        ? state.configStore.getFlavors()
        : state.configStore.getUserFlavors();
    return c.json(flavors);
  });

  /** Create flavor (admin only) */
  app.post("/", requireAdmin(state), zValidator("json", flavorSchema), (c) => {
    const flavor = state.configStore!.createFlavor(c.req.valid("json"));
    return c.json(flavor, 201);
  });

  /** Update flavor (admin only) */
  app.put(
    "/:id",
    requireAdmin(state),
    zValidator("json", flavorSchema.partial()),
    (c) => {
      const updated = state.configStore!.updateFlavor(
        c.req.param("id") as string,
        c.req.valid("json"),
      );
      if (!updated) return c.json({ error: "Not found" }, 404);
      return c.json(updated);
    },
  );

  /** Delete flavor (admin only) */
  app.delete("/:id", requireAdmin(state), (c) => {
    const ok = state.configStore!.deleteFlavor(c.req.param("id") as string);
    if (!ok) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  });

  return app;
}
