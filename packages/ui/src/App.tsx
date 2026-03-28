import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useBridgeContext } from "@/contexts/BridgeContext.js";
import { useSkin } from "@/components/DomainSkin.js";
import { ChatPanel }   from "@/components/ChatPanel.js";
import { Terminal }    from "@/components/Terminal.js";
import { ModulePanel } from "@/components/ModulePanel.js";
import type { BridgeStatus, SessionInfo, AgentInfo } from "@/types/bridge.js";
import type { LayoutMode, PanelConfig } from "@/types/skin.js";

// ─── Status dot ───────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: BridgeStatus }) {
  const dot: Record<BridgeStatus, string> = {
    connected:    "bg-success",
    connecting:   "bg-accent animate-pulse",
    disconnected: "bg-border",
  };
  const label: Record<BridgeStatus, string> = {
    connected:    "Connected",
    connecting:   "Connecting…",
    disconnected: "Offline",
  };
  return (
    <span className="flex items-center gap-1.5 text-xs text-text-muted">
      <span className={`w-1.5 h-1.5 rounded-full ${dot[status]}`} />
      {label[status]}
    </span>
  );
}

// ─── Connect banner ───────────────────────────────────────────────────────────

function ConnectBanner({ onConnect }: { onConnect: (token: string) => void }) {
  const [token, setToken] = useState(sessionStorage.getItem("cocapn_token") ?? "");
  const [err,   setErr]   = useState("");

  const submit = () => {
    if (!token.trim()) { setErr("Enter a GitHub PAT or leave blank to connect without auth."); return; }
    sessionStorage.setItem("cocapn_token", token.trim());
    onConnect(token.trim());
  };

  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 px-4 text-text-muted">
      <div className="text-center">
        <div className="text-3xl mb-3 opacity-20">⬡</div>
        <p className="text-sm font-semibold text-text">Bridge not connected</p>
        <p className="text-xs mt-1">
          Run{" "}
          <code className="font-mono text-primary">
            npx cocapn-bridge --repo ./my-brain
          </code>{" "}
          in your terminal, then connect.
        </p>
      </div>
      <div className="w-full max-w-sm flex flex-col gap-2">
        <input
          type="password"
          placeholder="GitHub PAT (optional — for auth)"
          value={token}
          onChange={(e) => { setToken(e.target.value); setErr(""); }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className="bg-surface border border-border rounded-skin px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-primary/60 transition-colors w-full"
        />
        {err && <p className="text-xs text-danger">{err}</p>}
        <button
          onClick={submit}
          className="px-4 py-2 rounded-skin border border-primary/40 text-primary text-sm hover:bg-primary/10 transition-colors"
        >
          Connect to local bridge
        </button>
        <button
          onClick={() => onConnect("")}
          className="text-xs text-text-muted hover:text-text transition-colors"
        >
          Connect without token
        </button>
      </div>
    </div>
  );
}

// ─── Fleet status pill ────────────────────────────────────────────────────────

function FleetPill({ domains }: { domains: string[] }) {
  if (domains.length === 0) return null;
  return (
    <span className="hidden sm:flex items-center gap-1 text-xs text-text-muted font-mono">
      <span className="text-border">·</span>
      {domains.slice(0, 3).map((d) => (
        <a key={d} href={`https://${d}`} target="_blank" rel="noopener noreferrer"
           className="hover:text-primary transition-colors">
          {d}
        </a>
      ))}
      {domains.length > 3 && <span className="text-border">+{domains.length - 3}</span>}
    </span>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

type PanelId = "chat" | "terminal" | "modules";

interface HeaderProps {
  domain: string;
  activePanel: PanelId;
  onPanelChange: (p: PanelId) => void;
  fleetDomains: string[];
}

function Header({ domain, activePanel, onPanelChange, fleetDomains }: HeaderProps) {
  const bridge = useBridgeContext();

  return (
    <header className="flex items-center gap-3 px-4 h-10 border-b border-border shrink-0 bg-surface">
      <span className="font-mono text-primary text-sm font-semibold tracking-wide">
        {domain}
      </span>
      <FleetPill domains={fleetDomains} />
      <div className="flex-1" />
      {/* Mobile panel switcher */}
      <nav className="flex md:hidden gap-1">
        {(["chat", "terminal", "modules"] as PanelId[]).map((id) => (
          <button
            key={id}
            onClick={() => onPanelChange(id)}
            className={[
              "px-2 py-1 rounded text-xs capitalize transition-colors",
              activePanel === id
                ? "text-primary bg-primary/10"
                : "text-text-muted hover:text-text",
            ].join(" ")}
          >
            {id}
          </button>
        ))}
      </nav>
      <StatusDot status={bridge.status} />
    </header>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

interface SidebarProps {
  activePanel: PanelId;
  onPanelChange: (p: PanelId) => void;
  agents: AgentInfo[];
  sessions: SessionInfo[];
}

function Sidebar({ activePanel, onPanelChange, agents, sessions }: SidebarProps) {
  const bridge = useBridgeContext();

  const navItems: Array<{ id: PanelId; label: string; hotkey: string }> = [
    { id: "chat",     label: "Chat",     hotkey: "1" },
    { id: "terminal", label: "Terminal", hotkey: "2" },
    { id: "modules",  label: "Modules",  hotkey: "3" },
  ];

  return (
    <aside className="w-52 border-r border-border flex-col hidden md:flex shrink-0 overflow-y-auto bg-surface">
      {/* Navigation */}
      <nav className="p-3 flex flex-col gap-0.5">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onPanelChange(item.id)}
            className={[
              "flex items-center justify-between px-3 py-1.5 rounded-skin text-sm transition-colors text-left",
              activePanel === item.id
                ? "bg-primary/10 text-primary"
                : "text-text-muted hover:text-text hover:bg-surface-2",
            ].join(" ")}
          >
            <span>{item.label}</span>
            <kbd className="text-[10px] text-border font-mono">{item.hotkey}</kbd>
          </button>
        ))}
      </nav>

      <div className="border-t border-border mx-3 my-1" />

      {/* Running agents */}
      {agents.length > 0 && (
        <div className="px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-text-muted mb-1.5">Agents</p>
          <div className="flex flex-col gap-1">
            {agents.map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
                <span className="font-mono text-text truncate">{a.id}</span>
                <span className="text-text-muted shrink-0">{a.sessions.length}s</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bridge sync button */}
      <div className="mt-auto p-3 border-t border-border">
        <button
          onClick={() => void bridge.request("bridge/sync")}
          disabled={bridge.status !== "connected"}
          className="w-full text-xs py-1.5 rounded-skin border border-border text-text-muted hover:text-text hover:border-border/80 transition-colors disabled:opacity-40"
        >
          Sync repo
        </button>
        {sessions.length > 0 && (
          <p className="text-[10px] text-text-muted mt-2 text-center">
            {sessions.length} session{sessions.length > 1 ? "s" : ""} connected
          </p>
        )}
      </div>
    </aside>
  );
}

// ─── Collapsible drawer (terminal) ────────────────────────────────────────────

function BottomDrawer({
  open,
  onToggle,
  height = 280,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  height?: number;
  children: ReactNode;
}) {
  return (
    <div
      className="shrink-0 border-t border-border transition-all duration-200 overflow-hidden bg-bg"
      style={{ height: open ? height : 0 }}
    >
      <div className="flex items-center justify-between px-4 h-7 border-b border-border bg-surface shrink-0">
        <span className="text-xs font-mono text-text-muted">Terminal</span>
        <button
          onClick={onToggle}
          className="text-xs text-text-muted hover:text-text transition-colors"
        >
          {open ? "▾" : "▴"}
        </button>
      </div>
      <div style={{ height: height - 28 }}>
        {open && children}
      </div>
    </div>
  );
}

// ─── Layout builder ───────────────────────────────────────────────────────────

function buildLayout(
  mode: LayoutMode | undefined,
  panels: PanelConfig[] | undefined
): { mode: LayoutMode; terminalHeight: number; terminalPanel: boolean } {
  const termPanel = panels?.find((p) => p.id === "terminal");
  return {
    mode:           mode ?? "sidebar-left",
    terminalHeight: termPanel?.height ?? 280,
    terminalPanel:  termPanel !== undefined,
  };
}

// ─── App ──────────────────────────────────────────────────────────────────────

export function App() {
  const bridge = useBridgeContext();
  const { domain, layout, config } = useSkin();

  const [activePanel,  setActivePanel]  = useState<PanelId>("chat");
  const [termOpen,     setTermOpen]     = useState(false);
  const [agents,       setAgents]       = useState<AgentInfo[]>([]);
  const [sessions,     setSessions]     = useState<SessionInfo[]>([]);

  const { mode, terminalHeight, terminalPanel } = buildLayout(
    layout?.mode,
    layout?.panels
  );

  const fleetDomains = config?.fleet?.domains ?? [];

  // ── Keyboard shortcuts (1/2/3 to switch panels) ──────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "1") setActivePanel("chat");
      if (e.key === "2") setActivePanel("terminal");
      if (e.key === "3") setActivePanel("modules");
      if (e.key === "`") setTermOpen((v) => !v);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Poll bridge/agents + bridge/sessions when connected ──────────────────

  useEffect(() => {
    if (bridge.status !== "connected") return;

    const poll = async () => {
      try {
        const [agentsRes, sessionsRes] = await Promise.all([
          bridge.request("bridge/agents"),
          bridge.request("bridge/sessions"),
        ]);
        setAgents((agentsRes as AgentInfo[] | null) ?? []);
        setSessions((sessionsRes as SessionInfo[] | null) ?? []);
      } catch {
        // Bridge may not have these methods yet
      }
    };

    void poll();
    const iv = setInterval(() => void poll(), 10_000);
    return () => clearInterval(iv);
  }, [bridge, bridge.status]);

  // ── Connect handler ───────────────────────────────────────────────────────

  const handleConnect = useCallback(
    (token: string) => bridge.connect(token || undefined),
    [bridge]
  );

  // ── Panel content ──────────────────────────────────────────────────────────

  const defaultAgent = config?.agents?.default ?? "claude";

  const panelContent: Record<PanelId, ReactNode> = {
    chat:     <ChatPanel defaultAgentId={defaultAgent} className="h-full" />,
    terminal: <Terminal className="h-full" />,
    modules:  <ModulePanel className="h-full" />,
  };

  // ── Zen mode (no sidebar, no terminal drawer) ─────────────────────────────

  if (mode === "zen") {
    return (
      <div className="flex flex-col h-dvh overflow-hidden bg-bg">
        <Header
          domain={domain}
          activePanel={activePanel}
          onPanelChange={setActivePanel}
          fleetDomains={fleetDomains}
        />
        <main className="flex-1 overflow-hidden">
          {bridge.status === "disconnected"
            ? <ConnectBanner onConnect={handleConnect} />
            : panelContent[activePanel]}
        </main>
      </div>
    );
  }

  // ── Bottom-drawer mode ────────────────────────────────────────────────────

  if (mode === "bottom-drawer") {
    return (
      <div className="flex flex-col h-dvh overflow-hidden bg-bg">
        <Header
          domain={domain}
          activePanel={activePanel}
          onPanelChange={setActivePanel}
          fleetDomains={fleetDomains}
        />
        <main className="flex-1 overflow-hidden">
          {bridge.status === "disconnected"
            ? <ConnectBanner onConnect={handleConnect} />
            : panelContent[activePanel]}
        </main>
        {terminalPanel && (
          <BottomDrawer
            open={termOpen}
            onToggle={() => setTermOpen((v) => !v)}
            height={terminalHeight}
          >
            <Terminal />
          </BottomDrawer>
        )}
      </div>
    );
  }

  // ── Sidebar-left (default) ─────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-dvh overflow-hidden bg-bg">
      <Header
        domain={domain}
        activePanel={activePanel}
        onPanelChange={setActivePanel}
        fleetDomains={fleetDomains}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          activePanel={activePanel}
          onPanelChange={setActivePanel}
          agents={agents}
          sessions={sessions}
        />
        <div className="flex flex-col flex-1 overflow-hidden">
          <main className="flex-1 overflow-hidden">
            {bridge.status === "disconnected"
              ? <ConnectBanner onConnect={handleConnect} />
              : panelContent[activePanel]}
          </main>
          {terminalPanel && (
            <BottomDrawer
              open={termOpen}
              onToggle={() => setTermOpen((v) => !v)}
              height={terminalHeight}
            >
              <Terminal />
            </BottomDrawer>
          )}
        </div>
      </div>
    </div>
  );
}
