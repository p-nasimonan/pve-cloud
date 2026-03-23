import { Hono } from "hono";
import type { Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  MANAGED_TAG,
  ownerTag,
  flavorTag,
  templateTag,
  parseTags,
} from "@pve-cloud/types";
import { getSession } from "../middleware/auth.js";
import type { AppState } from "../state.js";
import type { Instance } from "@pve-cloud/types";

const createSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-zA-Z0-9-]+$/, "Name must be alphanumeric with hyphens"),
  flavorId: z.string().uuid(),
  templateId: z.string().uuid(),
  sshPublicKey: z.string().min(1),
  /** Optional static IP in CIDR notation, e.g. 192.168.1.10/24. Defaults to DHCP. */
  ipConfig: z.string().optional(),
  /** Default gateway. Required when ipConfig is set. */
  gateway: z.string().optional(),
  startAfterCreate: z.boolean().default(true),
});

/** Select the online node with the most free memory */
async function pickBestNode(
  client: NonNullable<AppState["proxmoxClient"]>,
): Promise<string> {
  const nodes = await client.getNodes();
  const online = nodes.filter((n) => n.status === "online");
  if (online.length === 0) throw new Error("No online nodes available");
  return online.sort((a, b) => b.maxmem - b.mem - (a.maxmem - a.mem))[0]!
    .node;
}

/** Build instance object from a PVE VM */
function buildInstance(
  vmid: number,
  node: string,
  status: string,
  tags: Record<string, string>,
  name: string,
  ipv4?: string,
  cpu?: number,
  memMb?: number,
  diskGb?: number,
  uptime?: number,
): Instance {
  return {
    vmid,
    name,
    node,
    status: (["running", "stopped", "paused"].includes(status)
      ? status
      : "unknown") as Instance["status"],
    flavorId: tags["flavor"] ?? "",
    flavorName: tags["flavorName"] ?? tags["flavor"] ?? "",
    templateId: tags["template"] ?? "",
    owner: tags["owner"] ?? "",
    ipv4,
    cpu,
    memoryMb: memMb,
    diskGb,
    uptime,
  };
}

export function instanceRoutes(state: AppState) {
  const app = new Hono();

  /** List instances owned by the current user */
  app.get("/", async (c) => {
    const session = getSession(c, state);
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    const client = state.proxmoxClient!;
    const nodes = await client.getNodes();
    const instances: Instance[] = [];

    await Promise.all(
      nodes
        .filter((n) => n.status === "online")
        .map(async (n) => {
          const vms = await client.getVms(n.node);
          for (const vm of vms) {
            if (!vm.tags) continue;
            const tags = parseTags(vm.tags);
            if (tags["managed"] !== "true") continue;
            // Admins see all; users see only their own
            if (session.role !== "admin" && tags["owner"] !== session.username)
              continue;

            // Try to get IP from guest agent (best-effort)
            let ipv4: string | undefined;
            if (vm.status === "running") {
              try {
                ipv4 = await client.getVmIpv4(n.node, vm.vmid);
              } catch {
                // guest agent not running or not installed
              }
            }

            instances.push(
              buildInstance(
                vm.vmid,
                n.node,
                vm.status,
                tags,
                vm.name ?? `vm-${vm.vmid}`,
                ipv4,
                vm.cpus,
                vm.maxmem ? Math.round(vm.maxmem / 1024 / 1024) : undefined,
                vm.maxdisk
                  ? Math.round(vm.maxdisk / 1024 / 1024 / 1024)
                  : undefined,
                vm.uptime,
              ),
            );
          }
        }),
    );

    return c.json(instances);
  });

  /** Get single instance */
  app.get("/:vmid", async (c) => {
    const session = getSession(c, state);
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    const vmid = Number(c.req.param("vmid"));
    const client = state.proxmoxClient!;
    const nodes = await client.getNodes();

    for (const n of nodes.filter((nd) => nd.status === "online")) {
      try {
        const status = await client.getVmStatus(n.node, vmid);
        const vms = await client.getVms(n.node);
        const vm = vms.find((v) => v.vmid === vmid);
        if (!vm?.tags) continue;

        const tags = parseTags(vm.tags);
        if (tags["managed"] !== "true") continue;
        if (session.role !== "admin" && tags["owner"] !== session.username) {
          return c.json({ error: "Forbidden" }, 403);
        }

        let ipv4: string | undefined;
        if (status.status === "running") {
          try {
            ipv4 = await client.getVmIpv4(n.node, vmid);
          } catch {
            //
          }
        }

        return c.json(
          buildInstance(
            vmid,
            n.node,
            status.status,
            tags,
            vm.name ?? `vm-${vmid}`,
            ipv4,
            status.cpus,
            status.maxmem
              ? Math.round(status.maxmem / 1024 / 1024)
              : undefined,
          ),
        );
      } catch {
        // not on this node
      }
    }
    return c.json({ error: "Not found" }, 404);
  });

  /** Create an instance */
  app.post("/", zValidator("json", createSchema), async (c) => {
    const session = getSession(c, state);
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    if (!state.configStore) return c.json({ error: "Not configured" }, 503);

    const body = c.req.valid("json");
    const client = state.proxmoxClient!;

    // Validate flavor
    const flavor = state.configStore.getFlavorById(body.flavorId);
    if (!flavor) return c.json({ error: "Flavor not found" }, 404);
    if (session.role !== "admin" && !flavor.userVisible) {
      return c.json({ error: "Flavor not available" }, 403);
    }

    // Validate template
    const template = state.configStore.getTemplateById(body.templateId);
    if (!template) return c.json({ error: "Template not found" }, 404);
    if (session.role !== "admin" && !template.enabled) {
      return c.json({ error: "Template not available" }, 403);
    }

    // Pick best target node
    const targetNode = await pickBestNode(client);
    const newVmid = await client.getNextVmid();

    // Clone template
    const cloneUpid = await client.cloneVm(template.node, template.templateVmid, {
      newid: newVmid,
      name: body.name,
      target: targetNode,
      full: 1,
    });

    // Wait for clone to complete (poll task)
    await client.waitForTask(template.node, cloneUpid);

    // Set resources from flavor
    await client.setVmConfig(targetNode, newVmid, {
      cores: flavor.cpu,
      memory: flavor.memoryMb,
    });

    // Resize disk to flavor spec
    await client.resizeVmDisk(targetNode, newVmid, "scsi0", `${flavor.diskGb}G`);

    // Cloud-init config
    const ipConfig = body.ipConfig
      ? `ip=${body.ipConfig},gw=${body.gateway ?? ""}`
      : "ip=dhcp";

    await client.setVmConfig(targetNode, newVmid, {
      ciuser: session.username,
      sshkeys: encodeURIComponent(body.sshPublicKey.trim()),
      ipconfig0: ipConfig,
    });

    // Set ownership tags
    await client.setVmTags(targetNode, newVmid, [
      MANAGED_TAG,
      ownerTag(session.username),
      flavorTag(flavor.id),
      templateTag(template.id),
    ]);

    if (body.startAfterCreate) {
      await client.startVm(targetNode, newVmid);
    }

    return c.json({ vmid: newVmid, node: targetNode, upid: cloneUpid }, 201);
  });

  // ── Power actions ──────────────────────────────────────────────────────────

  async function withOwnedVm(
    c: Context,
    action: (node: string, vmid: number) => Promise<string>,
  ) {
    const session = getSession(c, state);
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    const vmid = Number(c.req.param("vmid"));
    const client = state.proxmoxClient!;
    const nodes = await client.getNodes();

    for (const n of nodes.filter((nd) => nd.status === "online")) {
      try {
        const vms = await client.getVms(n.node);
        const vm = vms.find((v) => v.vmid === vmid);
        if (!vm?.tags) continue;
        const tags = parseTags(vm.tags);
        if (tags["managed"] !== "true") continue;
        if (session.role !== "admin" && tags["owner"] !== session.username) {
          return c.json({ error: "Forbidden" }, 403);
        }
        const upid = await action(n.node, vmid);
        return c.json({ ok: true, upid });
      } catch {
        //
      }
    }
    return c.json({ error: "Not found" }, 404);
  }

  app.post("/:vmid/start", (c) =>
    withOwnedVm(c, (node, vmid) => state.proxmoxClient!.startVm(node, vmid)),
  );
  app.post("/:vmid/stop", (c) =>
    withOwnedVm(c, (node, vmid) => state.proxmoxClient!.stopVm(node, vmid)),
  );
  app.post("/:vmid/reboot", (c) =>
    withOwnedVm(c, (node, vmid) => state.proxmoxClient!.rebootVm(node, vmid)),
  );

  app.delete("/:vmid", async (c) => {
    return withOwnedVm(c, async (node, vmid) => {
      await state.proxmoxClient!.stopVm(node, vmid).catch(() => {});
      return state.proxmoxClient!.deleteVm(node, vmid);
    });
  });

  return app;
}
