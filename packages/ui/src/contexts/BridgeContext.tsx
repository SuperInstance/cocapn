import { createContext, useContext, type ReactNode } from "react";
import { useBridge, type BridgeHandle } from "@/hooks/useBridge.js";

const BridgeContext = createContext<BridgeHandle | null>(null);

export function BridgeProvider({ children }: { children: ReactNode }) {
  const bridge = useBridge();
  return <BridgeContext.Provider value={bridge}>{children}</BridgeContext.Provider>;
}

export function useBridgeContext(): BridgeHandle {
  const ctx = useContext(BridgeContext);
  if (!ctx) throw new Error("useBridgeContext must be used inside <BridgeProvider>");
  return ctx;
}
