import { useState, useEffect } from "react";
import { Shell } from "./components/Shell.js";
import { useBridge } from "./hooks/useBridge.js";

/**
 * App root — reads domain/username from the HTML element's data attributes
 * (set by the init script or the GitHub Pages deploy), connects to the bridge,
 * and renders the appropriate skin layout.
 */
export function App() {
  const domain = document.documentElement.dataset["domain"] ?? "cocapn";
  const bridge = useBridge();

  return (
    <Shell domain={domain} bridgeStatus={bridge.status}>
      {bridge.status === "disconnected" && (
        <DisconnectedBanner onConnect={() => bridge.connect()} />
      )}
    </Shell>
  );
}

function DisconnectedBanner({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-text-muted">
      <p className="text-sm">Bridge not connected</p>
      <button
        onClick={onConnect}
        className="px-4 py-2 rounded-skin border border-border text-primary text-sm
                   hover:border-primary hover:bg-primary/10 transition-colors"
      >
        Connect to local bridge
      </button>
      <p className="text-xs">
        Run{" "}
        <code className="font-mono text-primary">
          npx cocapn-bridge --repo ./my-log
        </code>{" "}
        in your terminal
      </p>
    </div>
  );
}
