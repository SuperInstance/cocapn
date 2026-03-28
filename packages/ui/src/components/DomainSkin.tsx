import {
  useState,
  useEffect,
  createContext,
  useContext,
  type ReactNode,
} from "react";
import type { LayoutConfig, CocapnPublicConfig } from "@/types/skin.js";

// ─── Context ──────────────────────────────────────────────────────────────────

interface SkinContextValue {
  domain: string;
  layout: LayoutConfig | null;
  config: CocapnPublicConfig | null;
  skinLoaded: boolean;
}

const SkinContext = createContext<SkinContextValue>({
  domain: "makerlog",
  layout: null,
  config: null,
  skinLoaded: false,
});

export function useSkin(): SkinContextValue {
  return useContext(SkinContext);
}

// ─── Domain detection ─────────────────────────────────────────────────────────

function detectDomain(): string {
  // 1. data-domain on <html> (set by init script or manually)
  const fromAttr = document.documentElement.dataset["domain"];
  if (fromAttr) return fromAttr;

  // 2. Hostname: {username}.{domain}.ai → domain
  const hostname = window.location.hostname;
  const parts = hostname.split(".");
  if (parts.length >= 3) {
    const candidate = parts[parts.length - 2];
    if (candidate) return candidate;
  }

  // 3. Fallback
  return "makerlog";
}

// ─── CSS variable injection ───────────────────────────────────────────────────

function applyCssVars(colors: Record<string, string>): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(colors)) {
    // Accept both "primary" and "--color-primary" as input keys
    const varName = key.startsWith("--") ? key : `--color-${key}`;
    root.style.setProperty(varName, value);
  }
}

// ─── DomainSkin component ─────────────────────────────────────────────────────

interface DomainSkinProps {
  children: ReactNode;
}

export function DomainSkin({ children }: DomainSkinProps) {
  const domain = detectDomain();
  const [layout, setLayout]     = useState<LayoutConfig | null>(null);
  const [config, setConfig]     = useState<CocapnPublicConfig | null>(null);
  const [skinLoaded, setSkinLoaded] = useState(false);

  useEffect(() => {
    let linkEl: HTMLLinkElement | null = null;

    async function loadSkin() {
      // 1. Inject theme.css <link> (replaces fallback inline styles)
      const cssUrl = `./skin/${domain}/theme.css`;
      linkEl = document.createElement("link");
      linkEl.rel  = "stylesheet";
      linkEl.id   = "cocapn-skin";
      linkEl.href = cssUrl;
      // Remove previous skin link if any
      document.getElementById("cocapn-skin")?.remove();
      document.head.appendChild(linkEl);
      // Remove fallback once skin CSS is ready
      linkEl.addEventListener("load", () => {
        document.getElementById("cocapn-skin-fallback")?.remove();
        setSkinLoaded(true);
      });
      linkEl.addEventListener("error", () => setSkinLoaded(true)); // proceed even if 404

      // 2. Fetch layout.json
      try {
        const layoutRes = await fetch(`./skin/${domain}/layout.json`);
        if (layoutRes.ok) {
          const layoutData = await layoutRes.json() as LayoutConfig;
          setLayout(layoutData);
        }
      } catch {
        // Use default layout
      }

      // 3. Fetch cocapn.yml (via GitHub API or direct if bundled)
      //    For simplicity, try a bundled version at /cocapn.json (Vite build)
      //    or fall back to a default.
      try {
        const configRes = await fetch("./cocapn.json");
        if (configRes.ok) {
          const configData = await configRes.json() as CocapnPublicConfig;
          setConfig(configData);
          // Apply any skin color overrides from cocapn.yml
          if (configData.skin?.colors) applyCssVars(configData.skin.colors);
        }
      } catch {
        // No bundled config — use CSS defaults
      }
    }

    void loadSkin();

    return () => {
      linkEl?.remove();
    };
  }, [domain]);

  return (
    <SkinContext.Provider value={{ domain, layout, config, skinLoaded }}>
      {children}
    </SkinContext.Provider>
  );
}
