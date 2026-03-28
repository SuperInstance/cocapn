import { useState, useEffect, useCallback, type FormEvent } from "react";
import { useBridgeContext } from "@/contexts/BridgeContext.js";
import { useSkin } from "@/components/DomainSkin.js";
import type { InstalledModule } from "@/types/skin.js";

// ─── Types ────────────────────────────────────────────────────────────────────

type ModuleStatus = "enabled" | "disabled" | "error" | "loading";

interface ModuleState {
  manifest: InstalledModule;
  status: ModuleStatus;
  error: string | undefined;
  component: React.ComponentType | undefined;
}

// ─── Module registry (module-level singleton) ─────────────────────────────────

// Tracks dynamically imported module UI components by name.
const componentRegistry = new Map<string, React.ComponentType>();

// ─── Module card ──────────────────────────────────────────────────────────────

function ModuleCard({
  state,
  onToggle,
  onUninstall,
}: {
  state: ModuleState;
  onToggle: () => void;
  onUninstall: () => void;
}) {
  const { manifest, status, error } = state;

  const typeColors: Record<string, string> = {
    skin:        "text-accent",
    agent:       "text-primary",
    tool:        "text-secondary",
    integration: "text-[#4499ff]",
  };

  return (
    <div className={[
      "border rounded-skin p-3 flex flex-col gap-2 transition-colors",
      status === "enabled"
        ? "border-border bg-surface"
        : "border-border/40 bg-surface/50 opacity-70",
    ].join(" ")}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text truncate">
              {manifest.name}
            </span>
            <span className={`text-[10px] font-mono uppercase ${typeColors[manifest.type] ?? "text-text-muted"}`}>
              {manifest.type}
            </span>
          </div>
          <div className="text-xs text-text-muted mt-0.5">v{manifest.version}</div>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-1.5 shrink-0">
          {status === "loading" && (
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          )}
          {status === "enabled"  && <span className="w-2 h-2 rounded-full bg-success" />}
          {status === "disabled" && <span className="w-2 h-2 rounded-full bg-border" />}
          {status === "error"    && <span className="w-2 h-2 rounded-full bg-danger" />}
        </div>
      </div>

      {error && (
        <p className="text-xs text-danger">{error}</p>
      )}

      {/* Provides */}
      {(manifest.provides?.agents?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1">
          {manifest.provides!.agents!.map((a) => (
            <span key={a} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary">
              {a}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-1">
        <button
          onClick={onToggle}
          disabled={status === "loading"}
          className={[
            "flex-1 text-xs py-1 rounded-skin border transition-colors",
            status === "enabled"
              ? "border-border text-text-muted hover:border-danger hover:text-danger"
              : "border-primary/40 text-primary hover:bg-primary/10",
          ].join(" ")}
        >
          {status === "enabled" ? "Disable" : "Enable"}
        </button>
        <button
          onClick={onUninstall}
          className="px-2 py-1 text-xs rounded-skin border border-border text-text-muted hover:border-danger hover:text-danger transition-colors"
          title="Uninstall"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ─── Install dialog ───────────────────────────────────────────────────────────

function InstallDialog({
  onInstall,
  onClose,
}: {
  onInstall: (gitUrl: string) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (url.trim()) onInstall(url.trim());
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border rounded-skin p-5 w-full max-w-md shadow-xl">
        <h3 className="text-sm font-semibold text-text mb-3">Install Module</h3>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-text-muted block mb-1">Git URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/user/cocapn-module-name"
              autoFocus
              className="w-full bg-surface-2 border border-border rounded-skin px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-primary/60 transition-colors"
            />
            <p className="text-[10px] text-text-muted mt-1">
              Must contain a <code className="font-mono">module.yml</code> at the repo root.
            </p>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm border border-border rounded-skin text-text-muted hover:text-text transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!url.trim()}
              className="px-3 py-1.5 text-sm rounded-skin bg-primary/10 text-primary border border-primary/40 hover:bg-primary/20 transition-colors disabled:opacity-40"
            >
              Install
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── ModulePanel ──────────────────────────────────────────────────────────────

interface ModulePanelProps {
  className?: string;
}

export function ModulePanel({ className = "" }: ModulePanelProps) {
  const bridge = useBridgeContext();
  const { config } = useSkin();

  const [modules,     setModules]     = useState<ModuleState[]>([]);
  const [showInstall, setShowInstall] = useState(false);
  const [installing,  setInstalling]  = useState(false);
  const [installErr,  setInstallErr]  = useState<string | null>(null);

  // ── Bootstrap module list from cocapn.yml ─────────────────────────────────

  useEffect(() => {
    if (!config?.modules) return;

    const initial: ModuleState[] = config.modules.map((name) => ({
      manifest: {
        name,
        version: "unknown",
        type:    "tool" as const,
        entry:   "",
        enabled: true,
        installedAt: new Date().toISOString(),
      },
      status:    "enabled" as const,
      error:     undefined,
      component: undefined,
    }));

    setModules(initial);
  }, [config]);

  // ── Dynamic import of module UI component ─────────────────────────────────

  const loadComponent = useCallback(async (state: ModuleState): Promise<void> => {
    const { name, entry } = state.manifest;
    if (componentRegistry.has(name) || !entry) return;

    setModules((prev) =>
      prev.map((m) => m.manifest.name === name ? { ...m, status: "loading" } : m)
    );

    try {
      const mod = await import(/* @vite-ignore */ entry) as { default?: React.ComponentType };
      if (mod.default) {
        const comp = mod.default;
        componentRegistry.set(name, comp);
        setModules((prev) =>
          prev.map((m) =>
            m.manifest.name === name
              ? { ...m, status: "enabled" as const, component: comp }
              : m
          )
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setModules((prev) =>
        prev.map((m) =>
          m.manifest.name === name ? { ...m, status: "error", error: msg } : m
        )
      );
    }
  }, []);

  const toggleModule = useCallback((name: string) => {
    setModules((prev) =>
      prev.map((m) => {
        if (m.manifest.name !== name) return m;
        const next: ModuleStatus = m.status === "enabled" ? "disabled" : "enabled";
        if (next === "enabled" && m.manifest.entry) {
          void loadComponent(m);
        }
        return { ...m, status: next };
      })
    );
  }, [loadComponent]);

  const uninstallModule = useCallback((name: string) => {
    setModules((prev) => prev.filter((m) => m.manifest.name !== name));
    componentRegistry.delete(name);
  }, []);

  // ── Install via bridge BASH (git clone) ───────────────────────────────────

  const handleInstall = useCallback(async (gitUrl: string) => {
    setInstalling(true);
    setInstallErr(null);
    setShowInstall(false);

    // Extract module name from URL
    const urlParts  = gitUrl.replace(/\.git$/, "").split("/");
    const repoName  = urlParts.at(-1) ?? "module";
    const moduleName = repoName.replace(/^cocapn-/, "");

    const id = `install-${moduleName}`;

    const result = await new Promise<{ exitCode: number; stderr: string }>((resolve) => {
      let stderr = "";
      const unsub = bridge.subscribe("BASH_OUTPUT", (out) => {
        if (out.id !== id) return;
        if (out.stderr) stderr += out.stderr;
        if (out.done) {
          unsub();
          resolve({ exitCode: out.exitCode ?? 0, stderr });
        }
      });
      bridge.send({
        type:    "BASH",
        id,
        command: `git clone --depth 1 "${gitUrl}" cocapn/modules/${moduleName}`,
      });
    });

    if (result.exitCode !== 0) {
      setInstallErr(`Install failed: ${result.stderr}`);
      setInstalling(false);
      return;
    }

    // Fetch module.yml via bridge
    const fetchId = `fetch-manifest-${moduleName}`;
    const manifestResult = await new Promise<{ content: string; ok: boolean }>((resolve) => {
      const unsub = bridge.subscribe("BASH_OUTPUT", (out) => {
        if (out.id !== fetchId) return;
        if (out.done) {
          unsub();
          resolve({ content: out.stdout ?? "", ok: out.exitCode === 0 });
        }
      });
      bridge.send({
        type:    "BASH",
        id:      fetchId,
        command: `cat cocapn/modules/${moduleName}/module.yml`,
      });
    });

    const newModule: ModuleState = {
      manifest: {
        name:        moduleName,
        version:     "unknown",
        type:        "tool" as const,
        entry:       manifestResult.ok ? `./cocapn/modules/${moduleName}/index.js` : "",
        enabled:     true,
        gitUrl,
        installedAt: new Date().toISOString(),
      },
      status:    "enabled" as const,
      error:     undefined,
      component: undefined,
    };

    setModules((prev) => [...prev, newModule]);
    setInstalling(false);
  }, [bridge]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <span className="text-sm font-semibold text-text">Modules</span>
        <button
          onClick={() => setShowInstall(true)}
          className="text-xs px-2 py-1 rounded-skin border border-primary/40 text-primary hover:bg-primary/10 transition-colors"
        >
          + Install
        </button>
      </div>

      {/* Module list */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {installing && (
          <div className="flex items-center gap-2 text-sm text-text-muted py-2">
            <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Installing module…
          </div>
        )}

        {installErr && (
          <div className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-skin px-3 py-2">
            {installErr}
          </div>
        )}

        {modules.length === 0 && !installing && (
          <div className="text-sm text-text-muted text-center py-8">
            No modules installed.
            <br />
            <button
              onClick={() => setShowInstall(true)}
              className="text-primary underline underline-offset-2 mt-1"
            >
              Install one
            </button>
          </div>
        )}

        {modules.map((state) => (
          <ModuleCard
            key={state.manifest.name}
            state={state}
            onToggle={() => toggleModule(state.manifest.name)}
            onUninstall={() => uninstallModule(state.manifest.name)}
          />
        ))}
      </div>

      {showInstall && (
        <InstallDialog
          onInstall={(url) => void handleInstall(url)}
          onClose={() => setShowInstall(false)}
        />
      )}
    </div>
  );
}
