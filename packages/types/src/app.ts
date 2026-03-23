/** System setup state */
export type SetupStatus = "unconfigured" | "configured";

export interface SetupState {
  status: SetupStatus;
  hasAdmin: boolean;
  proxmoxConnected: boolean;
}

/** Proxmox connection config */
export interface ProxmoxConnectionConfig {
  host: string;
  port: number;
  tokenId: string;
  tokenSecret: string;
  /** Skip TLS verification (self-signed certs) */
  allowInsecure?: boolean;
}

export type UserRole = "admin" | "user";

/** Flavor = VM size plan (like AWS instance types). Stored in JSON config file. */
export interface Flavor {
  id: string;
  name: string;
  cpu: number;
  memoryMb: number;
  diskGb: number;
  /** Whether regular users can select this flavor. Admins can always use any flavor. */
  userVisible: boolean;
  description?: string;
}

/** Template registered by admin. References a Proxmox template VM. */
export interface RegisteredTemplate {
  id: string;
  name: string;
  /** Proxmox VMID of the template VM */
  templateVmid: number;
  /** Node where the template lives */
  node: string;
  osType: string;
  /** Whether regular users can select this template */
  enabled: boolean;
  description?: string;
}

/** Instance = a running/stopped VM owned by a user */
export interface Instance {
  vmid: number;
  name: string;
  node: string;
  status: "running" | "stopped" | "paused" | "unknown";
  flavorId: string;
  flavorName: string;
  templateId: string;
  owner: string;
  ipv4?: string;
  createdAt?: string;
  cpu?: number;
  memoryMb?: number;
  diskGb?: number;
  uptime?: number;
}

/** Tag helpers — pve-cloud uses Proxmox VM tags as the source of truth */
export const TAG_PREFIX = "pve-cloud";
export const MANAGED_TAG = `${TAG_PREFIX}:managed`;
export const ownerTag = (username: string) => `${TAG_PREFIX}:owner=${username}`;
export const flavorTag = (flavorId: string) => `${TAG_PREFIX}:flavor=${flavorId}`;
export const templateTag = (templateId: string) =>
  `${TAG_PREFIX}:template=${templateId}`;

export function parseTags(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const tag of raw.split(";").map((t) => t.trim())) {
    if (!tag.startsWith(TAG_PREFIX)) continue;
    const inner = tag.slice(TAG_PREFIX.length + 1);
    const eq = inner.indexOf("=");
    if (eq === -1) {
      result[inner] = "true";
    } else {
      result[inner.slice(0, eq)] = inner.slice(eq + 1);
    }
  }
  return result;
}
