// ─── Skin / layout types ──────────────────────────────────────────────────────

export type PanelPosition = "left" | "right" | "top" | "bottom" | "center";
export type LayoutMode = "sidebar-left" | "sidebar-right" | "bottom-drawer" | "zen";

export interface PanelConfig {
  id: string;
  position: PanelPosition;
  width?: number;     // px, for left/right
  height?: number;    // px, for top/bottom
  flex?: number;      // flex-grow for center
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

export interface NavItem {
  label: string;
  panel: string;
  icon?: string;
  hotkey?: string;
}

export interface Breakpoint {
  maxWidth: number;
  hidePanels?: string[];
  layout?: LayoutMode;
}

export interface LayoutConfig {
  mode: LayoutMode;
  panels: PanelConfig[];
  navigation: NavItem[];
  header?: { style: "minimal" | "full" | "none" };
  breakpoints?: Breakpoint[];
}

// ─── cocapn.yml shape (public config) ────────────────────────────────────────

export interface OrchestratorRule {
  match: string;
  agent: string;
  priority: number;
}

export interface CocapnPublicConfig {
  version: string;
  domain: string;
  skin?: {
    colors?: Record<string, string>;
    layout?: {
      sidebar?: boolean;
      terminal?: boolean;
      header?: string;
    };
  };
  modules?: string[];
  agents?: {
    available?: string[];
    default?: string;
    fallback?: string;
  };
  orchestrator?: {
    strategy?: "first-match" | "highest-priority" | "cost-optimized";
    rules?: OrchestratorRule[];
  };
  fleet?: { domains?: string[] };
}

// ─── Module manifest (module.yml) ────────────────────────────────────────────

export interface ModuleManifest {
  name: string;
  version: string;
  type: "skin" | "agent" | "tool" | "integration";
  entry: string;
  requires?: string[];
  provides?: {
    capabilities?: string[];
    agents?: string[];
  };
}

export interface InstalledModule extends ModuleManifest {
  enabled: boolean;
  gitUrl?: string;
  installedAt: string;
}
