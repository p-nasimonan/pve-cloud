import type { ProxmoxConnectionConfig, PveVersion, UserRole } from "@pve-cloud/types";
import type { ProxmoxClient } from "./proxmox/client.js";
import type { ConfigStore } from "./store/config-store.js";

export interface Session {
  username: string;
  role: UserRole;
  createdAt: number;
}

export interface AppState {
  proxmoxClient: ProxmoxClient | null;
  proxmoxConfig: ProxmoxConnectionConfig | null;
  proxmoxVersion: PveVersion | null;
  adminUsername: string | null;
  adminPasswordHash: string | null;
  sessions: Map<string, Session>;
  configStore: ConfigStore | null;
}

export function createAppState(): AppState {
  return {
    proxmoxClient: null,
    proxmoxConfig: null,
    proxmoxVersion: null,
    adminUsername: null,
    adminPasswordHash: null,
    sessions: new Map(),
    configStore: null,
  };
}
