import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BridgeProvider } from "@/contexts/BridgeContext.js";
import { DomainSkin } from "@/components/DomainSkin.js";
import { App } from "@/App.js";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root element not found");

createRoot(root).render(
  <StrictMode>
    <DomainSkin>
      <BridgeProvider>
        <App />
      </BridgeProvider>
    </DomainSkin>
  </StrictMode>
);
