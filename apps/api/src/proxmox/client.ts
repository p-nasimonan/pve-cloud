import { fetch, Agent } from "undici";
import type {
  ProxmoxConnectionConfig,
  PveResponse,
  PveVersion,
  PveNode,
  PveQemuVm,
  PveQemuStatus,
  PveCloneParams,
  PveCloudInitConfig,
  PveTaskStatus,
} from "@pve-cloud/types";

/**
 * Thin Proxmox API client.
 * Intentionally minimal — only wraps HTTP calls and typing.
 * New API endpoints can be added without touching existing code.
 */
export class ProxmoxClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private agent: Agent | undefined;

  constructor(config: ProxmoxConnectionConfig) {
    // allowInsecure=true on localhost uses plain HTTP (mock dev server)
    const isLocalhost =
      config.host === "localhost" || config.host === "127.0.0.1";
    const scheme = config.allowInsecure && isLocalhost ? "http" : "https";
    this.baseUrl = `${scheme}://${config.host}:${config.port}/api2/json`;
    this.headers = {
      Authorization: `PVEAPIToken=${config.tokenId}=${config.tokenSecret}`,
    };
    // For real Proxmox with self-signed certs (non-localhost HTTPS)
    if (config.allowInsecure && !isLocalhost) {
      this.agent = new Agent({ connect: { rejectUnauthorized: false } });
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const res = await fetch(url, {
      method,
      headers: {
        ...this.headers,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      ...(this.agent ? { dispatcher: this.agent } : {}),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new ProxmoxApiError(res.status, text, path);
    }

    const json = (await res.json()) as PveResponse<T>;
    return json.data;
  }

  // ── Cluster ──────────────────────────────────────────────

  async getVersion(): Promise<PveVersion> {
    return this.request<PveVersion>("GET", "/version");
  }

  async getNodes(): Promise<PveNode[]> {
    return this.request<PveNode[]>("GET", "/nodes");
  }

  // ── QEMU VMs ─────────────────────────────────────────────

  async getVms(node: string): Promise<PveQemuVm[]> {
    return this.request<PveQemuVm[]>("GET", `/nodes/${node}/qemu`);
  }

  async getVmStatus(node: string, vmid: number): Promise<PveQemuStatus> {
    return this.request<PveQemuStatus>(
      "GET",
      `/nodes/${node}/qemu/${vmid}/status/current`,
    );
  }

  async startVm(node: string, vmid: number): Promise<string> {
    return this.request<string>(
      "POST",
      `/nodes/${node}/qemu/${vmid}/status/start`,
    );
  }

  async stopVm(node: string, vmid: number): Promise<string> {
    return this.request<string>(
      "POST",
      `/nodes/${node}/qemu/${vmid}/status/stop`,
    );
  }

  async rebootVm(node: string, vmid: number): Promise<string> {
    return this.request<string>(
      "POST",
      `/nodes/${node}/qemu/${vmid}/status/reboot`,
    );
  }

  async cloneVm(
    node: string,
    vmid: number,
    params: PveCloneParams,
  ): Promise<string> {
    return this.request<string>(
      "POST",
      `/nodes/${node}/qemu/${vmid}/clone`,
      params as unknown as Record<string, unknown>,
    );
  }

  async setVmConfig(
    node: string,
    vmid: number,
    config: PveCloudInitConfig & Record<string, unknown>,
  ): Promise<void> {
    await this.request<null>(
      "PUT",
      `/nodes/${node}/qemu/${vmid}/config`,
      config as Record<string, unknown>,
    );
  }

  async setVmTags(
    node: string,
    vmid: number,
    tags: string[],
  ): Promise<void> {
    await this.request<null>("PUT", `/nodes/${node}/qemu/${vmid}/config`, {
      tags: tags.join(";"),
    });
  }

  async deleteVm(node: string, vmid: number): Promise<string> {
    return this.request<string>("DELETE", `/nodes/${node}/qemu/${vmid}`);
  }

  async resizeVmDisk(
    node: string,
    vmid: number,
    disk: string,
    size: string,
  ): Promise<void> {
    await this.request<null>(
      "PUT",
      `/nodes/${node}/qemu/${vmid}/resize`,
      { disk, size },
    );
  }

  // ── Tasks ────────────────────────────────────────────────

  async getTaskStatus(node: string, upid: string): Promise<PveTaskStatus> {
    return this.request<PveTaskStatus>(
      "GET",
      `/nodes/${node}/tasks/${encodeURIComponent(upid)}/status`,
    );
  }

  /** Poll a task UPID until it completes or times out (default 5 min) */
  async waitForTask(
    node: string,
    upid: string,
    timeoutMs = 300_000,
    pollMs = 2_000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const task = await this.getTaskStatus(node, upid);
      if (task.status === "stopped") {
        if (task.exitstatus !== "OK") {
          throw new Error(`Task ${upid} failed: ${task.exitstatus}`);
        }
        return;
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
    throw new Error(`Task ${upid} timed out after ${timeoutMs}ms`);
  }

  // ── Guest Agent ──────────────────────────────────────────

  /** Get first non-loopback IPv4 from QEMU guest agent */
  async getVmIpv4(node: string, vmid: number): Promise<string | undefined> {
    const data = await this.request<{
      result?: Array<{
        name: string;
        "ip-addresses"?: Array<{ "ip-address": string; "ip-address-type": string }>;
      }>;
    }>("GET", `/nodes/${node}/qemu/${vmid}/agent/network-get-interfaces`);

    for (const iface of data.result ?? []) {
      if (iface.name === "lo") continue;
      for (const addr of iface["ip-addresses"] ?? []) {
        if (addr["ip-address-type"] === "ipv4") {
          return addr["ip-address"];
        }
      }
    }
    return undefined;
  }

  // ── Next free VMID ───────────────────────────────────────

  async getNextVmid(): Promise<number> {
    return this.request<number>("GET", "/cluster/nextid");
  }
}

export class ProxmoxApiError extends Error {
  constructor(
    public status: number,
    public body: string,
    public path: string,
  ) {
    super(`Proxmox API error ${status} on ${path}: ${body}`);
    this.name = "ProxmoxApiError";
  }
}
