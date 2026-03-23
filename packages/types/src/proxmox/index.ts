/**
 * Proxmox VE API type definitions.
 *
 * These types are intentionally kept minimal and additive:
 * only fields actually used by pve-cloud are defined.
 * Unknown fields from newer API versions pass through safely
 * because we never use `Exact` types for API responses.
 */

/** Envelope used by all Proxmox API responses */
export interface PveResponse<T> {
  data: T;
}

/** GET /api2/json/version */
export interface PveVersion {
  version: string;
  release: string;
  repoid: string;
}

/** GET /api2/json/nodes */
export interface PveNode {
  node: string;
  status: "online" | "offline" | "unknown";
  cpu: number;
  maxcpu: number;
  mem: number;
  maxmem: number;
  disk: number;
  maxdisk: number;
  uptime: number;
  [key: string]: unknown;
}

/** GET /api2/json/nodes/{node}/qemu */
export interface PveQemuVm {
  vmid: number;
  name?: string;
  status: string;
  cpus?: number;
  maxmem?: number;
  maxdisk?: number;
  mem?: number;
  disk?: number;
  uptime?: number;
  tags?: string;
  template?: 0 | 1;
  [key: string]: unknown;
}

/** GET /api2/json/nodes/{node}/qemu/{vmid}/status/current */
export interface PveQemuStatus {
  status: string;
  vmid: number;
  name?: string;
  cpus?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
  uptime?: number;
  pid?: number;
  qmpstatus?: string;
  [key: string]: unknown;
}

/** POST /api2/json/nodes/{node}/qemu/{vmid}/clone */
export interface PveCloneParams {
  newid: number;
  name?: string;
  target?: string;
  full?: 0 | 1;
  pool?: string;
  description?: string;
}

/** POST /api2/json/nodes/{node}/qemu/{vmid}/config (cloud-init) */
export interface PveCloudInitConfig {
  ciuser?: string;
  cipassword?: string;
  sshkeys?: string;
  ipconfig0?: string;
  nameserver?: string;
  searchdomain?: string;
  [key: string]: unknown;
}

/** UPID returned by async operations */
export interface PveTaskStatus {
  upid: string;
  node: string;
  status: string;
  exitstatus?: string;
  type: string;
  [key: string]: unknown;
}
