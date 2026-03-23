import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { Flavor, RegisteredTemplate } from "@pve-cloud/types";

interface ConfigData {
  flavors: Flavor[];
  templates: RegisteredTemplate[];
}

/**
 * Persistent config store backed by a JSON file.
 * No relational DB — all VM/instance state lives in Proxmox tags.
 * This file stores only app-level configuration (Flavors, Templates).
 */
export class ConfigStore {
  private data: ConfigData;

  constructor(private readonly filePath: string) {
    this.data = this.load();
  }

  private load(): ConfigData {
    if (!existsSync(this.filePath)) {
      return { flavors: [], templates: [] };
    }
    try {
      const raw = readFileSync(this.filePath, "utf8");
      return JSON.parse(raw) as ConfigData;
    } catch {
      console.warn(
        `[config-store] Failed to parse ${this.filePath}, starting with empty config`,
      );
      return { flavors: [], templates: [] };
    }
  }

  private persist(): void {
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf8");
  }

  // ── Flavors ──────────────────────────────────────────────────────────────────

  getFlavors(): Flavor[] {
    return this.data.flavors;
  }

  getUserFlavors(): Flavor[] {
    return this.data.flavors.filter((f) => f.userVisible);
  }

  getFlavorById(id: string): Flavor | undefined {
    return this.data.flavors.find((f) => f.id === id);
  }

  createFlavor(
    input: Omit<Flavor, "id">,
  ): Flavor {
    const flavor: Flavor = { id: randomUUID(), ...input };
    this.data.flavors.push(flavor);
    this.persist();
    return flavor;
  }

  updateFlavor(id: string, input: Partial<Omit<Flavor, "id">>): Flavor | null {
    const idx = this.data.flavors.findIndex((f) => f.id === id);
    if (idx === -1) return null;
    this.data.flavors[idx] = { ...this.data.flavors[idx]!, ...input };
    this.persist();
    return this.data.flavors[idx]!;
  }

  deleteFlavor(id: string): boolean {
    const before = this.data.flavors.length;
    this.data.flavors = this.data.flavors.filter((f) => f.id !== id);
    if (this.data.flavors.length === before) return false;
    this.persist();
    return true;
  }

  // ── Templates ────────────────────────────────────────────────────────────────

  getTemplates(): RegisteredTemplate[] {
    return this.data.templates;
  }

  getEnabledTemplates(): RegisteredTemplate[] {
    return this.data.templates.filter((t) => t.enabled);
  }

  getTemplateById(id: string): RegisteredTemplate | undefined {
    return this.data.templates.find((t) => t.id === id);
  }

  createTemplate(input: Omit<RegisteredTemplate, "id">): RegisteredTemplate {
    const template: RegisteredTemplate = { id: randomUUID(), ...input };
    this.data.templates.push(template);
    this.persist();
    return template;
  }

  updateTemplate(
    id: string,
    input: Partial<Omit<RegisteredTemplate, "id">>,
  ): RegisteredTemplate | null {
    const idx = this.data.templates.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    this.data.templates[idx] = { ...this.data.templates[idx]!, ...input };
    this.persist();
    return this.data.templates[idx]!;
  }

  deleteTemplate(id: string): boolean {
    const before = this.data.templates.length;
    this.data.templates = this.data.templates.filter((t) => t.id !== id);
    if (this.data.templates.length === before) return false;
    this.persist();
    return true;
  }
}
