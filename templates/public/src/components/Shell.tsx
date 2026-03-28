import type { ReactNode } from "react";

interface ShellProps {
  domain: string;
  bridgeStatus: "connected" | "connecting" | "disconnected";
  children: ReactNode;
}

/**
 * Shell — top-level layout container.
 * Reads the layout.json for the active skin and renders panels.
 * In the template, all panels are static; the init script replaces this
 * with the full implementation for the chosen domain.
 */
export function Shell({ domain, bridgeStatus, children }: ShellProps) {
  return (
    <div className="flex flex-col h-dvh overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 h-10 border-b border-border shrink-0">
        <span className="font-mono text-primary text-sm font-semibold tracking-wide">
          {domain}
        </span>
        <span className="text-border">·</span>
        <StatusDot status={bridgeStatus} />
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-52 border-r border-border flex-col hidden md:flex shrink-0 overflow-y-auto">
          <nav className="p-3 flex flex-col gap-1">
            {["Chat", "Wiki", "Tasks", "Memory", "Terminal"].map((label) => (
              <button
                key={label}
                className="text-left px-3 py-1.5 rounded-skin text-sm text-text-muted
                           hover:text-text hover:bg-surface-2 transition-colors"
              >
                {label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: ShellProps["bridgeStatus"] }) {
  const colors = {
    connected:    "bg-success",
    connecting:   "bg-accent animate-pulse",
    disconnected: "bg-border",
  } as const;

  const labels = {
    connected:    "Bridge connected",
    connecting:   "Connecting…",
    disconnected: "Bridge offline",
  } as const;

  return (
    <span className="flex items-center gap-1.5 text-xs text-text-muted">
      <span className={`w-1.5 h-1.5 rounded-full ${colors[status]}`} />
      {labels[status]}
    </span>
  );
}
