/**
 * Module manifest types — mirrors module.yml structure.
 */

export type ModuleType = "skin" | "agent" | "tool" | "integration";

export interface ModuleHooks {
  install:  string | undefined;
  enable:   string | undefined;
  disable:  string | undefined;
  update:   string | undefined;
}

export interface SkinConfig {
  css:    string | undefined;
  layout: string | undefined;
}

export interface AgentConfig {
  file: string;
}

export interface ToolConfig {
  mcp:         string | undefined;
  packageJson: boolean | undefined;
}

export interface IntegrationConfig {
  webhooks: string[];
}

export interface ModuleManifest {
  name:        string;
  version:     string;
  type:        ModuleType;
  description: string;
  /** Semver range of compatible cocapn versions, e.g. ">=0.1.0" */
  cocapn:      string | undefined;
  /** Module ids this module depends on */
  dependencies: string[];

  hooks: ModuleHooks;

  skin:        SkinConfig | undefined;
  agent:       AgentConfig | undefined;
  tool:        ToolConfig | undefined;
  integration: IntegrationConfig | undefined;
}

// ─── Installed module record (persisted in cocapn/modules.json) ───────────────

export type ModuleStatus = "enabled" | "disabled" | "error";

export interface InstalledModule {
  name:        string;
  version:     string;
  type:        ModuleType;
  description: string;
  gitUrl:      string;
  installedAt: string;
  updatedAt:   string;
  status:      ModuleStatus;
  error:       string | undefined;
}

// ─── ALLOWED_WRITE_DIRS ───────────────────────────────────────────────────────
// Modules may write outside their own directory ONLY to these paths.

export const ALLOWED_WRITE_DIRS = [
  "wiki",
  "tasks",
  "cocapn/memory",
  "cocapn/agents",
  "skin",
] as const;
