import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getSession, requireAdmin } from "../middleware/auth.js";
import type { AppState } from "../state.js";

const templateSchema = z.object({
  name: z.string().min(1).max(64),
  templateVmid: z.number().int().min(100),
  node: z.string().min(1),
  osType: z.string().min(1),
  enabled: z.boolean().default(true),
  description: z.string().max(256).optional(),
});

export function templateRoutes(state: AppState) {
  const app = new Hono();

  /** List templates — users see only enabled, admins see all */
  app.get("/", (c) => {
    if (!state.configStore) return c.json({ error: "Not configured" }, 503);
    const session = getSession(c, state);
    const templates =
      session?.role === "admin"
        ? state.configStore.getTemplates()
        : state.configStore.getEnabledTemplates();
    return c.json(templates);
  });

  /**
   * Scan Proxmox for VMs marked as templates (template=1).
   * Admin only — used to discover templates to register.
   */
  app.get("/scan", requireAdmin(state), async (c) => {
    const client = state.proxmoxClient!;
    const nodes = await client.getNodes();
    const results: Array<{
      node: string;
      vmid: number;
      name: string;
      osType: string;
    }> = [];

    await Promise.all(
      nodes
        .filter((n) => n.status === "online")
        .map(async (n) => {
          const vms = await client.getVms(n.node);
          for (const vm of vms) {
            if (vm.template === 1) {
              results.push({
                node: n.node,
                vmid: vm.vmid,
                name: vm.name ?? `template-${vm.vmid}`,
                osType: "linux",
              });
            }
          }
        }),
    );

    return c.json(results);
  });

  /** Register a template (admin only) */
  app.post(
    "/",
    requireAdmin(state),
    zValidator("json", templateSchema),
    (c) => {
      const template = state.configStore!.createTemplate(c.req.valid("json"));
      return c.json(template, 201);
    },
  );

  /** Update template (admin only) */
  app.put(
    "/:id",
    requireAdmin(state),
    zValidator("json", templateSchema.partial()),
    (c) => {
      const updated = state.configStore!.updateTemplate(
        c.req.param("id") as string,
        c.req.valid("json"),
      );
      if (!updated) return c.json({ error: "Not found" }, 404);
      return c.json(updated);
    },
  );

  /** Delete template (admin only) */
  app.delete("/:id", requireAdmin(state), (c) => {
    const ok = state.configStore!.deleteTemplate(c.req.param("id") as string);
    if (!ok) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  });

  return app;
}
