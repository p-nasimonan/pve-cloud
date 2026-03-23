import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import type {
  PveVersion,
  PveNode,
  PveQemuVm,
  PveQemuStatus,
} from "@pve-cloud/types";

/**
 * Mock Proxmox VE API server for local frontend/backend development.
 * Simulates enough of the PVE API to develop against without a real cluster.
 */

const mockVersion: PveVersion = {
  version: "8.3.2",
  release: "8.3",
  repoid: "mock-dev",
};

const mockNodes: PveNode[] = [
  {
    node: "pve-node1",
    status: "online",
    cpu: 0.15,
    maxcpu: 8,
    mem: 4_294_967_296,
    maxmem: 17_179_869_184,
    disk: 10_737_418_240,
    maxdisk: 107_374_182_400,
    uptime: 864000,
  },
  {
    node: "pve-node2",
    status: "online",
    cpu: 0.42,
    maxcpu: 16,
    mem: 12_884_901_888,
    maxmem: 34_359_738_368,
    disk: 32_212_254_720,
    maxdisk: 214_748_364_800,
    uptime: 432000,
  },
];

let nextVmid = 200;
const vms = new Map<string, PveQemuVm[]>();

// Seed some VMs
vms.set("pve-node1", [
  {
    vmid: 100,
    name: "ubuntu-template",
    status: "stopped",
    cpus: 2,
    maxmem: 2_147_483_648,
    maxdisk: 10_737_418_240,
    template: 1,
    tags: "pve-cloud:managed",
  },
  {
    vmid: 101,
    name: "user-vm-1",
    status: "running",
    cpus: 2,
    maxmem: 2_147_483_648,
    maxdisk: 10_737_418_240,
    mem: 1_073_741_824,
    uptime: 3600,
    tags: "pve-cloud:managed;pve-cloud:owner=admin",
  },
]);
vms.set("pve-node2", []);

function wrap<T>(data: T) {
  return { data };
}

const app = new Hono();
app.use("*", logger());

// ── Version ──
app.get("/api2/json/version", (c) => c.json(wrap(mockVersion)));

// ── Nodes ──
app.get("/api2/json/nodes", (c) => c.json(wrap(mockNodes)));

// ── QEMU VMs ──
app.get("/api2/json/nodes/:node/qemu", (c) => {
  const node = c.req.param("node");
  return c.json(wrap(vms.get(node) ?? []));
});

app.get("/api2/json/nodes/:node/qemu/:vmid/status/current", (c) => {
  const node = c.req.param("node");
  const vmid = Number(c.req.param("vmid"));
  const nodeVms = vms.get(node) ?? [];
  const vm = nodeVms.find((v) => v.vmid === vmid);
  if (!vm) return c.json({ errors: { vmid: "not found" } }, 404);

  const status: PveQemuStatus = {
    status: vm.status,
    vmid: vm.vmid,
    name: vm.name,
    cpus: vm.cpus,
    mem: vm.mem ?? 0,
    maxmem: vm.maxmem,
    disk: vm.disk ?? 0,
    maxdisk: vm.maxdisk,
    uptime: vm.uptime ?? 0,
  };
  return c.json(wrap(status));
});

// ── VM Actions ──
app.post("/api2/json/nodes/:node/qemu/:vmid/status/start", (c) => {
  const node = c.req.param("node");
  const vmid = Number(c.req.param("vmid"));
  const nodeVms = vms.get(node) ?? [];
  const vm = nodeVms.find((v) => v.vmid === vmid);
  if (vm) vm.status = "running";
  return c.json(wrap(`UPID:${node}:mock-start-${vmid}`));
});

app.post("/api2/json/nodes/:node/qemu/:vmid/status/stop", (c) => {
  const node = c.req.param("node");
  const vmid = Number(c.req.param("vmid"));
  const nodeVms = vms.get(node) ?? [];
  const vm = nodeVms.find((v) => v.vmid === vmid);
  if (vm) vm.status = "stopped";
  return c.json(wrap(`UPID:${node}:mock-stop-${vmid}`));
});

app.post("/api2/json/nodes/:node/qemu/:vmid/status/reboot", (c) => {
  const node = c.req.param("node");
  const vmid = Number(c.req.param("vmid"));
  return c.json(wrap(`UPID:${node}:mock-reboot-${vmid}`));
});

// ── Clone ──
app.post("/api2/json/nodes/:node/qemu/:vmid/clone", async (c) => {
  const node = c.req.param("node");
  const body = await c.req.json<{ newid?: number; name?: string; target?: string }>();
  const targetNode = body.target ?? node;
  const newVmid = body.newid ?? nextVmid++;
  const targetVms = vms.get(targetNode) ?? [];

  targetVms.push({
    vmid: newVmid,
    name: body.name ?? `clone-${newVmid}`,
    status: "stopped",
    cpus: 1,
    maxmem: 1_073_741_824,
    maxdisk: 10_737_418_240,
  });
  vms.set(targetNode, targetVms);

  return c.json(wrap(`UPID:${node}:mock-clone-${newVmid}`));
});

// ── Config (PUT) ──
app.put("/api2/json/nodes/:node/qemu/:vmid/config", (c) => {
  return c.json(wrap(null));
});

// ── Delete ──
app.delete("/api2/json/nodes/:node/qemu/:vmid", (c) => {
  const node = c.req.param("node");
  const vmid = Number(c.req.param("vmid"));
  const nodeVms = vms.get(node) ?? [];
  vms.set(
    node,
    nodeVms.filter((v) => v.vmid !== vmid),
  );
  return c.json(wrap(`UPID:${node}:mock-delete-${vmid}`));
});

// ── Next VMID ──
app.get("/api2/json/cluster/nextid", (c) => {
  return c.json(wrap(nextVmid++));
});

// ── Resize disk (no-op in mock) ──
app.put("/api2/json/nodes/:node/qemu/:vmid/resize", (c) => {
  return c.json(wrap(null));
});

// ── Guest agent: return mock IP ──
app.get("/api2/json/nodes/:node/qemu/:vmid/agent/network-get-interfaces", (c) => {
  return c.json(
    wrap({
      result: [
        {
          name: "eth0",
          "ip-addresses": [
            { "ip-address": "192.168.1.100", "ip-address-type": "ipv4" },
          ],
        },
      ],
    }),
  );
});

// ── Task status (always complete) ──
app.get("/api2/json/nodes/:node/tasks/:upid/status", (c) => {
  return c.json(
    wrap({
      upid: c.req.param("upid"),
      node: c.req.param("node"),
      status: "stopped",
      exitstatus: "OK",
      type: "mock",
    }),
  );
});

const port = Number(process.env["MOCK_PVE_PORT"] ?? 18006);
console.log(`Mock Proxmox VE API starting on port ${port}`);
serve({ fetch: app.fetch, port }, () => {
  console.log(`Mock Proxmox VE API running at http://localhost:${port}`);
});
